'use strict';

//== Utils ==//

function deepContains(subj, obj) {
  if (typeof obj != 'object')
    return subj === obj;
  for (var key in obj) {
    if (!deepContains(subj[key], obj[key]))
      return false;
  }
  return true;
}

function deepClone(src) {
  var clone = Array.isArray(src) ? [] : {};
  for (var key in src) {
    var val = src[key];
    clone[key] = typeof val == 'object' ? deepClone(val) : val;
  }
  return clone;
}

const directions = ['forward', 'left', 'backward', 'right'];
const cardinals = ['east', 'north', 'west', 'south'];

function dirToCard(facing, direction) {
  var idxA = cardinals.indexOf(facing);
  var idxB = directions.indexOf(direction);
  if (idxA < 0 || idxB < 0)
    return null;
  return cardinals[(idxB + idxA) % 4];
}

function cardToDir(facing, cardinal) {
  var idxA = cardinals.indexOf(facing);
  var idxB = cardinals.indexOf(cardinal);
  if (idxA < 0 || idxB < 0)
    return null;
  return directions[(idxB - idxA) & 0x03]; // 2-bit w/ overflow, kind of like mod 4, but always positive
}

function stepInDir(facing, direction, position) {
  var newPos = {
    x: position.x,
    y: position.y
  };
  switch (dirToCard(facing, direction)) {
    case 'east': newPos.x++; break;
    case 'north': newPos.y--; break;
    case 'west': newPos.x--; break;
    case 'south': newPos.y++; break;
  }
  return newPos;
}


//== WorldState ==//

class WorldState {

  constructor(src, mapDiff) {
    this.state = {};
    if (typeof src == 'object') {
      this.mapDiff = Array.isArray(mapDiff) ? deepClone(mapDiff) : [];
      this.apply(src);
    }
  }

  apply(src) {
    for (var key in src) {
      var val = src[key];
      this.state[key] = typeof val == 'object' ? deepClone(val) : val;
    }
  }

  contains(other) {
    // TODO: mapdiff
    return deepContains(this.state, other.state);
  }

  equals(other) {
    // TODO: mapdiff
    if (!this.contains(other))
      return false;
    for (let key in this) {
      if (typeof other[key] == 'undefined')
        return false;
    }
    return true;
  }

  toString() {
    var string = '';
    for (var key in this) {
      string += key + ': ' + this[key] + '\n';
    }
    return string;
  }
}

WorldState.clone = function(other) {
  return new WorldState(other.state, other.mapDiff);
}


//== Goals ==//

class Goal {
  fulfilled(worldState) {
    return true;
  }

  getUrgency(worldState) {
    return 1;
  }

  getName() { return '...'; }
}

class ExplorationGoal extends Goal {
  fulfilled(worldState) {
    // TODO: modify to take advantage of the new
    if (worldState.state.currentCell == CELL_STAIRS)
      return false;

    for (let i = 0; i < directions.length; i++) {
      if (worldState.state[directions[i]] == CELL_UNEXPLORED)
        return true;
    }
    return false;
  }

  getName() { return 'explore'; }
}

class StairsGoal extends Goal {
  fulfilled(worldState) {
    return worldState.state.currentCell == CELL_STAIRS;
  }

  getUrgency() {
    return 0.5;
  }

  getName() { return 'reach the stairs'; }
}

class SurvivalGoal extends Goal {
  constructor(hpLimit, hpGoal) {
    super();
    this.hpLimit = hpLimit;
    this.hpGoal = hpGoal;
    this.healing = false;
  }

  fulfilled(worldState) {
    return worldState.state.health >= this.hpGoal;
  }

  getUrgency(worldState) {
    if (this.healing && worldState.state.health >= this.hpGoal) {
      this.healing = false;
    } else if (worldState.state.health < this.hpLimit) {
      this.healing = true;
    }
    return this.healing ? 2 : 0;
  }

  getName() { return 'survive'; }
}

class RescueGoal extends Goal {

  fulfilled(worldState) {
    return worldState.captiveCount == 0;
  }

  getName() { return 'rescue'; }
}

class KillGoal extends Goal {

  fulfilled(worldState) {
    return !!worldState.state.enemyKilled;
  }

  getUrgency(worldState) {
    if (worldState.state.underFire)
      return 10;
    if (worldState.state.knownEnemies > 0)
      return 2;
    else
      return 0;
  }

  getName() { return 'kill'; }
}


//== Map ==//

const CELL_UNEXPLORED = 0x00;
const CELL_EMPTY = 0x01;
const CELL_STAIRS = 0x02;
const CELL_ENEMY = 0x04;
const CELL_CAPTIVE = 0x08;
const CELL_WALL = 0x10;
const CELL_TICKING = 0x20;

class Map {

  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.offset = { x: 0, y: 0 };
    this.cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.cells.push({
          type: CELL_UNEXPLORED,
          hpDrain: 0
        });
      }
    }
  }

  setCell(x, y, value) {
    x += this.offset.x;
    y += this.offset.y;
    this.cells[x + y*this.width] = value;

    var newWidth = this.width;
    var newHeight = this.height;
    var offsetX = 0;
    var offsetY = 0;
    if (x == 0) {
      newWidth += 5;
      offsetX = 5;
    } else if (x == this.width - 1) {
      newWidth += 5;
    } else if (y == 0) {
      newHeight += 5;
      offsetY = 5;
    } else if (y == this.height - 1) {
      newHeight += 5;
    }
    if (newWidth != this.width || newHeight != this.height) {
      this.offset.x += offsetX;
      this.offset.y += offsetY;
      var oldCells = this.cells;
      this.cells = [];
      for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
          let cell = null;
          if ((x >= offsetX && x < offsetX + this.width) &&
              (y >= offsetY && y < offsetY + this.height)) {
            cell = oldCells[(x - offsetX) + (y - offsetY) * this.width];
          } else {
            cell = {
              type: CELL_UNEXPLORED,
              hpDrain: 0
            }
          }
          this.cells.push(cell);
        }
      }
      this.width = newWidth;
      this.height = newHeight;
    }
  }

  getCell(x, y, mapDiff) {
    x += this.offset.x;
    y += this.offset.y;
    if (Array.isArray(mapDiff)) {
      for (let i = mapDiff.length - 1; i >= 0; i--) {
        if (mapDiff[i].x + this.offset.x == x &&
            mapDiff[i].y + this.offset.y == y)
          return mapDiff[i].value;
      }
    }
    return this.cells[x + y*this.width];
  }

  toString(position) {
    if (!!position) {
      position = {
        x: position.x + this.offset.x,
        y: position.y + this.offset.y
      }
    } else {
      position = { x: -1, y: -1 };
    }
    var string = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        var char = '';
        if (x == position.x && y == position.y) {
          char = '@';
        } else {
          switch (this.cells[x + y*this.width].type) {
            case CELL_UNEXPLORED: char = '?'; break;
            case CELL_EMPTY: char = this.cells[x + y*this.width].hpDrain ? '*' : ' '; break;
            case CELL_STAIRS: char = '>'; break;
            case CELL_ENEMY: char = 'E'; break;
            case CELL_CAPTIVE: char = 'C'; break;
            case CELL_WALL: char = 'X'; break;
            case CELL_TICKING: char = 'B'; break;
          }
        }
        string += char;
      }
      if (y < this.height - 1)
        string += '\n';
    }
    return string;
  }
}


//== Action ==//

class Action {

  constructor(player) {
    this.player = player;
    // TODO: pass players into method calls instead?
  }

  canPerform(worldState) {
    return true;
  }

  getEffects(worldState) {
    return {};
  }

  getCost(worldState) {
    return 1;
  }

  applyEffects(worldState) {
    var effects = this.getEffects(worldState);
    worldState.apply(effects);
    return worldState;
  }

  perform(warrior, worldState) {
    this.applyEffects(worldState);
    var mapDiff = worldState.mapDiff;
    for (let i = 0; i < mapDiff.length; i++) {
      this.player.map.setCell(
        mapDiff[i].x,
        mapDiff[i].y,
        mapDiff[i].value
      )
    }
    worldState.mapDiff = [];
  }

  toString() {
    return 'Action';
  }
}


//== Walking ==//

class Walk extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    return worldState.state[this.direction] == CELL_EMPTY ||
           worldState.state[this.direction] == CELL_STAIRS;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.walk(this.direction);
  }

  getEffects(worldState) {
    var effects = {
      position: stepInDir(
        worldState.state.facing,
        this.direction,
        worldState.state.position
      )
    };
    this.player.virtualSense(
      effects,
      worldState.state.facing,
      worldState.mapDiff,
      effects.position.x,
      effects.position.y
    );
    return effects;
  }

  toString() {
    return 'Walk ' + this.direction;
  }
}


//== Attacking ==//

class Attack extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    // TODO: health concerns
    return (worldState.state[this.direction] & CELL_ENEMY);
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.attack(this.direction);
  }

  getCost(worldState) {
    return this.direction == 'forward' ? 1 : 3; // TODO: something about costs is not working, need to sort that out
  }

  getEffects(worldState) {
    var position = worldState.state.position;
    var diff = stepInDir(
      worldState.state.facing,
      this.direction,
      position
    );
    diff.value = {
      type: CELL_EMPTY,
      hpDrain: 0
    };
    worldState.mapDiff.push(diff);

    var effects = {
      enemyKilled: true
    };
    this.player.virtualSense(
      effects,
      worldState.state.facing,
      worldState.mapDiff,
      position.x,
      position.y
    );
    return effects;
  }

  toString() {
    return 'Attack ' + this.direction;
  }
}


//== Resting ==//

class Rest extends Action {

  canPerform(worldState) {
    if (worldState.state.enemyAdjacent ||
        worldState.state.health >= 20) {
      return false;
    }
    var position = worldState.state.position;
    var cell = this.player.map.getCell(position.x, position.y, worldState.mapDiff);
    return cell.hpDrain < 2;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.rest();
  }

  getEffects(worldState) {
    var effects = {
      health: worldState.state.health + 2,
      healed: 2
    }
    if (effects.health > 20)
      effects.health = 20;
    return effects;
  }

  toString() {
    return 'Rest';
  }
}


//== Rescuing ==//

class Rescue extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    return worldState.state[this.direction] == CELL_CAPTIVE;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.rescue(this.direction);
  }

  getEffects(worldState) {
    var position = worldState.state.position;
    var diff = stepInDir(
      worldState.state.facing,
      this.direction,
      position
    );
    diff.value = {
      type: CELL_EMPTY,
      hpDrain: 0
    };
    worldState.mapDiff.push(diff);

    var effects = {};
    this.player.virtualSense(
      effects,
      worldState.state.facing,
      worldState.mapDiff,
      position.x,
      position.y
    );
    return effects;
  }

  toString() {
    return 'Rescue ' + this.direction;
  }
}


//== Pivoting ==//

class Pivot extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    // TODO: raise cost instead when it's working
    return !worldState.state.enemyAdjacent;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.pivot(this.direction);
  }

  getEffects(worldState) {
    var effects = {
      facing: dirToCard(worldState.state.facing, this.direction)
    }
    this.player.virtualSense(
      effects,
      effects.facing,
      worldState.mapDiff,
      worldState.state.position.x,
      worldState.state.position.y
    );
    return effects;
  }

  toString() {
    return 'Pivot ' + this.direction;
  }
}


//== Shooting ==//

class Shoot extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  hitScan(worldState) {
    var position = worldState.state.position;
    var facing = worldState.state.facing;
    for (let i = 0; i < 3; i++) {
      position = stepInDir(facing, this.direction, position);
      var cell = this.player.map.getCell(position.x, position.y, worldState.mapDiff).type;
      if ((cell & CELL_CAPTIVE) ||
          (cell & CELL_ENEMY) ||
          (cell & CELL_WALL) ||
          (cell & CELL_UNEXPLORED)) {
        return {
          cell: cell,
          position: position
        }
      }
    }
    return null;
  }

  canPerform(worldState) {
    var hit = this.hitScan(worldState);
    return (hit != null) && (hit.cell & CELL_ENEMY);
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.shoot(this.direction);
  }

  getEffects(worldState) {
    var hit = this.hitScan(worldState);
    var diff = {
      x: hit.position.x,
      y: hit.position.y,
      value: {
        type: hit.position.type,
        hpDrain: 0
      }
    };
    worldState.mapDiff.push(diff);

    var position = worldState.state.position;
    var effects = {
      enemyKilled: true
    };
    this.player.virtualSense(
      effects,
      worldState.state.facing,
      worldState.mapDiff,
      position.x,
      position.y
    );
    return effects;
  }

  toString() {
    return 'Shoot ' + this.direction;
  }
}


//== Planner ==//

class Planner {

  makePlan(player, goal) {

    function getCost(node) {
      if (node.action == null)
        return 0;
      var cost = node.action.getCost(node.state);
      if (node.parent != null)
        cost += getCost(node.parent);
      return cost;
    }

    function findInsertPoint(nodeList, cost, idxLo, idxHi) {
      if (idxLo == idxHi)
        return idxLo;
      var idxMid = Math.floor((idxLo + idxHi) / 2);
      var node = nodeList[idxMid];
      var otherCost = getCost(node);
      if (cost < otherCost)
        return findInsertPoint(nodeList, cost, idxLo, idxLo + Math.floor((idxHi - idxLo) / 2));
      else if (cost > otherCost)
        return findInsertPoint(nodeList, cost, idxLo + Math.ceil((idxHi - idxLo) / 2), idxHi);
      else
        return idxMid;
    }

    function insertNode(nodeList, idx, node) {
      for (let i = nodeList.length; i > idx; i--) {
        nodeList[i] = nodeList[i-1];
      }
      nodeList[idx] = node;
    }

    function availableActions(actions, worldState) {
      var available = [];
      for (let i = 0; i < actions.length; i++) {
        if (actions[i].canPerform(worldState))
          available.push(actions[i]);
      }
      return available;
    }

    function findInList(nodeList, state) {
      for (let i = 0; i < nodeList.length; i++) {
        if (nodeList[i].state.equals(state))
          return nodeList[i];
      }
      return null;
    }

    function unwindPlan(node) {
      var plan = [];
      var current = node;
      while (current != null) {
        if (current.action != null)
          plan.unshift(current.action);
        current = current.parent;
      }
      return plan;
    }

    console.log('Let me think...');

    var open = [];
    var closed = [];
    open.push({
      state: player.worldState,
      action: null,
      parent: null
    });

    var maxIterations = 100;
    var iteration = 0;
    while (open.length > 0 && iteration < maxIterations) {
      iteration++;
      var node = open.shift();
      // Let's see if we've reached the goal
      if (goal.fulfilled(node.state)) {
        console.log('Goal fulfilled on iteration ' + iteration);
        // Food for thought: Can we really be sure that the shortest path was found?
        // Maybe this is an intrinsic property of dijkstra?
        return unwindPlan(node);
      }
      // Otherwise, let's explore our possibilities
      var actions = availableActions(player.actions, node.state);
      for (let i = 0; i < actions.length; i++) {
        var action = actions[i];
        var newState = action.applyEffects(WorldState.clone(node.state));
        // Let's see if we've already been here
        var foundNode = findInList(open, newState) || findInList(closed, newState);
        if (foundNode == null) {
          // If not, we add this new state as an open node
          open.push({
            state: newState,
            action: action,
            parent: node
          })
        } else {
          // But if we have, we update the path if a more efficient one was used
          var oldCost = getCost(foundNode);
          var newCost = getCost(node) + action.getCost(node.worldState);
          if (newCost < oldCost) {
            foundNode.parent = node;
          }
        }
      }
      closed.push(node);
    }

    console.log('Could not find a way to ' + goal.getName() + ' ;(');
    console.log('iterations: ' + iteration);
    return [];
  }
}

const planner = new Planner();


//== Player ==//

class Player {

  constructor() {
    this.turnCount = 0;
    this.map = new Map(10, 10);
    var position = { x: 1, y: 1 };
    this.map.setCell(position.x, position.y, {
      type: CELL_EMPTY,
      hpDrain: 0
    });
    this.worldState = new WorldState({
      facing: 'east',
      position: position,
      currentCell: null,
      captiveCount: 0,
      knownEnemies: 0,
      underFire: false
    });
    this.actions = [
      new Walk(this, 'forward'),
      new Walk(this, 'backward'),
      new Attack(this, 'forward'),
      new Attack(this, 'backward'),
      new Rest(this),
      new Rescue(this, 'forward'),
      new Rescue(this, 'backward'),
      new Pivot(this, 'backward'),
      new Shoot(this, 'forward'),
      new Shoot(this, 'backward')
    ];
    this.goals = [
      new ExplorationGoal(),
      new StairsGoal(),
      new SurvivalGoal(13, 20),
      new KillGoal()
      // new RescueGoal()
    ];
    this.plan = [];
    this.currentGoal = null;
    this.prevHP = 20;
  }

  prioritize() {
    this.goals.sort((a, b) => {
      var aUrgency = a.getUrgency(this.worldState);
      var bUrgency = b.getUrgency(this.worldState);
      return bUrgency - aUrgency; // Sort with descending urgency
    });
  }

  sense(warrior) {
    var state = this.worldState.state;
    var cell = this.map.getCell(state.position.x, state.position.y);
    var enemyKilled = false;
    var enemyAdjacent = false;

    state.health = warrior.health();
    var hpDrain = Math.min(this.prevHP + state.healed, 20) - state.health;
    state.healed = 0;
    cell.hpDrain = hpDrain;
    console.log('HP drain: ' + hpDrain);
    console.log('HP left: ' + state.health);

    for (let i = 0; i < directions.length; i++) {
      let direction = directions[i];
      //let space = warrior.feel(direction);
      let spaces = warrior.look(direction);
      let position = state.position;
      for (let i = 0; i < spaces.length; i++) {
        let space = spaces[i];
        position = stepInDir(state.facing, direction, position);
        let cell = CELL_UNEXPLORED;
        if (space.isCaptive()) {
          cell |= CELL_CAPTIVE;
        } else if (space.isEnemy()) {
          cell |= CELL_ENEMY;
          enemyAdjacent = true;
        } else if (space.isWall()) {
          cell |= CELL_WALL;
        } else if (space.isTicking()) {
          cell |= CELL_TICKING;
        } else if (space.isStairs()) {
          cell |= CELL_STAIRS;
        } else if (space.isEmpty()) {
          cell |= CELL_EMPTY;
        }
        let oldCell = this.map.getCell(position.x, position.y).type;
        if (cell != oldCell) {
          if (oldCell == CELL_ENEMY) {
            enemyKilled = true;
            this.worldState.state.knownEnemies--;
          }
          this.plan = []; // New info, plan needs to be updated
          if (cell == CELL_CAPTIVE)
            this.worldState.state.captiveCount++;
          if (cell == CELL_ENEMY)
            this.worldState.state.knownEnemies++;
        }
        this.map.setCell(position.x, position.y, {
          type: cell,
          // hpDrain: this.map.getCell(position.x, position.y).hpDrain
          hpDrain: 0
        });
        if (i == 0)
          state[direction] = cell;
      }
    }
    state.enemyKilled = enemyKilled;
    state.enemyAdjacent = enemyAdjacent;
    if (hpDrain > 0 && !enemyAdjacent)
      state.underFire = true;
    else if (state.underFire && state.enemyKilled)
      state.underFire = false;
    state.currentCell = cell.type;
    console.log('Under fire: ' + state.underFire);
    console.log(this.map.toString(state.position));
  }

  virtualSense(effects, facing, mapDiff, x, y) {
    // TODO: adapt to emulate look() instead of feel()
    var map = this.map;
    var enemyAdjacent = false;
    effects.currentCell = map.getCell(x, y, mapDiff).type;
    for (let i = 0; i < directions.length; i++) {
      var direction = directions[i];
      var position = stepInDir(facing, direction, { x: x, y: y });
      var cell = map.getCell(position.x, position.y, mapDiff).type;
      effects[direction] = cell;
      if (cell & CELL_ENEMY)
        enemyAdjacent = true;
    }
    effects.enemyAdjacent = enemyAdjacent;
  }

  playTurn(warrior) {
    console.log('\n== TURN ' + this.turnCount + ' ==');
    this.sense(warrior);
    console.log(this.worldState);
    this.prioritize();
    if (this.plan.length == 0 || this.goals[0] != this.currentGoal) {
      for (let i = 0; i < this.goals.length; i++) {
        console.log('I need to ' + this.goals[i].getName());
        this.plan = planner.makePlan(this, this.goals[i]);
        console.log('Plan length: ' + this.plan.length);
        if (this.plan.length > 0) {
          this.currentGoal = this.goals[i];
          break;
        }
      }
      if (this.plan.length > 0) {
        console.log('This is my plan: ' + this.plan.length);
        for (let i = 0; i < this.plan.length; i++) {
          console.log('  ' + (i+1) + '. ' + this.plan[i].toString());
        }
      } else {
        console.log('I have no plan ;(');
      }
    }

    if (this.plan.length > 0)
      this.plan.shift().perform(warrior, this.worldState);

    this.prevHP = warrior.health();
    this.turnCount++;
  }
}
