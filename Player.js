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
}

class ExplorationGoal extends Goal {
  fulfilled(worldState) {
    for (let i = 0; i < directions.length; i++) {
      if (worldState.state[directions[i]] == CELL_UNEXPLORED)
        return true;
    }
    return false;
  }
}

class StairsGoal extends Goal {
  fulfilled(worldState) {
    return worldState.state.currentCell == CELL_STAIRS;
  }
}


//== Map ==//

const CELL_UNEXPLORED = 0x00;
const CELL_EMPTY = 0x01;
const CELL_STAIRS = 0x02;
const CELL_ENEMY = 0x03;
const CELL_CAPTIVE = 0x04;
const CELL_WALL = 0x05;
const CELL_TICKING = 0x06;

class Map {

  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.cells.push(CELL_UNEXPLORED);
      }
    }
  }

  resize(x, y, width, height) {
    // TODO: resize map
  }

  setCell(x, y, value) {
    this.cells[x + y*this.width] = value;
  }

  getCell(x, y, mapDiff) {
    if (Array.isArray(mapDiff)) {
      for (let i = mapDiff.length - 1; i >= 0; i--) {
        if (mapDiff[i].x == x && mapDiff[i].y == y)
          return mapDiff[i].value;
      }
    }
    return this.cells[x + y*this.width];
  }

  toString() {
    var string = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        var char = '';
        switch (this.cells[x + y*this.width]) {
          case CELL_UNEXPLORED: char = '?'; break;
          case CELL_EMPTY: char = ' '; break;
          case CELL_STAIRS: char = '>'; break;
          case CELL_ENEMY: char = 'E'; break;
          case CELL_CAPTIVE: char = 'C'; break;
          case CELL_WALL: char = 'X'; break;
          case CELL_TICKING: char = 'B'; break;
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
    return worldState.state[this.direction] == CELL_EMPTY;
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
      worldState,
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

class Kill extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    // TODO: health concerns
    return worldState.state[this.direction] == CELL_ENEMY;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.attack(this.direction);
  }

  getEffects(worldState) {
    var position = worldState.state.position;
    var diff = stepInDir(
      worldState.state.facing,
      this.direction,
      position
    );
    diff.value = CELL_EMPTY;
    worldState.mapDiff.push(diff);

    var effects = {};
    this.player.virtualSense(
      effects,
      worldState,
      position.x,
      position.y
    );
    return effects;
  }

  toString() {
    return 'Kill ' + this.direction;
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

    console.log('Could not find a way to fulfill goal ;(');
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
    this.map.setCell(position.x, position.y, CELL_EMPTY);
    this.worldState = new WorldState({
      facing: 'east',
      position: position,
      currentCell: null
    });
    this.actions = [
      new Walk(this, 'forward'),
      new Walk(this, 'backward'),
      new Kill(this, 'forward')
    ];
    this.goals = [
      new ExplorationGoal(),
      new StairsGoal()
    ];
    this.plan = [];
    this.prevHP = 20;
  }

  prioritize() {
    return this.goals;
  }

  sense(warrior) {
    var state = this.worldState.state;
    for (let i = 0; i < directions.length; i++) {
      var direction = directions[i];
      var space = warrior.feel(direction);
      var position = stepInDir(state.facing, direction, state.position);
      var cell = CELL_UNEXPLORED;
      if (space.isEmpty())
        cell = CELL_EMPTY;
      else if (space.isStairs())
        cell = CELL_STAIRS;
      else if (space.isEnemy())
        cell = CELL_ENEMY;
      else if (space.isCaptive())
        cell = CELL_CAPTIVE;
      else if (space.isWall())
        cell = CELL_WALL;
      else if (space.isTicking())
        cell = CELL_TICKING;
      if (cell != this.map.getCell(position.x, position.y)) {
        this.plan = []; // New info, plan needs to be updated
      }
      this.map.setCell(position.x, position.y, cell);
      state[direction] = cell;
    }
    state.health = warrior.health();
    var hpDrain = this.prevHP - state.health;
    console.log('HP drain: ' + hpDrain);
    console.log(this.map.toString());
  }

  virtualSense(effects, worldState, x, y) {
    var state = worldState.state;
    var mapDiff = worldState.mapDiff;
    var map = this.map;
    for (let i = 0; i < directions.length; i++) {
      var direction = directions[i];
      var position = stepInDir(state.facing, direction, { x: x, y: y });
      effects[direction] = map.getCell(position.x, position.y, mapDiff);
    }
  }

  playTurn(warrior) {
    console.log('\n== TURN ' + this.turnCount + ' ==');
    this.sense(warrior);
    if (this.plan.length == 0) {
      var goals = this.prioritize();
      for (let i = 0; i < goals.length; i++) {
        this.plan = planner.makePlan(this, goals[i]);
        if (this.plan.length > 0)
          break;
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
