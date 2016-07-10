
//== Utils ==//

function deepContains(subj, obj) {
  if (typeof obj != 'object')
    return subj === object;
  for (var key in obj) {
    if (!deepContains(subj[key], obj[key]))
      return false;
  }
  return true;
}

function deepClone(src) {
  var clone = {};
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
  var idxC = idxB - idxA;
  if (idxA < 0 || idxB < 0)
    return null;
  if (idxC < 0)
    idxC += 4;
  return directions[idxC];
}


//== WorldState ==//

class WorldState {

  constructor(state) {
    if (typeof(state) == 'object') {
      this.apply(state);
    }
  }

  apply(src) {
    for (var key in src) {
      var val = src[key];
      this[key] = typeof val == 'object' ? deepClone(val) : val;
    }
  }

  contains(other) {
    deepContains(this, other);
    return true;
  }

  // toString() {
  //   var string = '';
  //   for (var key in this) {
  //     string += key + ': ' + this[key] + '\n';
  //   }
  //   return string;
  // }
}


//== Goals ==//

class Goal {
  fullfilled() {
    return true;
  }
}

class ExplorationGoal extends Goal {
  fullfilled(worldState) {
    for (let i = 0; i < directions.length; i++) {
      if (worldState[direction] == CELL_EMPTY)
        return true;
    }
    return false;
  }
}

class StairsGoal extends Goal {
  fullfilled(worldState) {
    return worldState.currentCell == CELL_STAIRS;
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

  getCell(x, y) {
    return this.cells[x + y*this.width];
  }

  toString() {
    var string = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        string += this.cells[x + y*this.width];
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
  }

  canPerform(worldState) {
    return true;
  }

  getEffects(worldState) {
    return {};
  }

  applyEffects(worldState) {
    var clone = new WorldState(worldState);
    var effects = this.getEffects(worldState);
    clone.apply(effects);
    return clone;
  }

  perform(warrior, worldState) {
    this.applyEffects(worldState);
  }
}


//== Walking ==//

class Walk extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(worldState) {
    return worldState[this.direction] == CELL_EMPTY;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.walk(this.direction);
  }

  getEffects(worldState) {
    var position = worldState.position;
    var map = this.player.map;
    switch (worldState.facing) {
      case 'east': position.x++; break;
      case 'north': position.y--; break;
      case 'west': position.x--; break;
      case 'south': position.y++; break;
    }
    return {
      position: position
    };
  }
}


//== Attacking ==//

class Attack extends Action {

  constructor(player, direction) {
    super(player);
    this.direction = direction;
  }

  canPerform(warrior, worldState) {
    // TODO: health concerns
    return worldState[this.direction] == CELL_ENEMY;
  }

  perform(warrior, worldState) {
    super.perform(warrior, worldState);
    warrior.attack(this.direction);
  }
}


//== Planner ==//

class Planner {
  // TODO: the big stuff
}


//== Player ==//

class Player {

  constructor() {
    this.turnCount = 0;
    this.map = new Map(10, 10);
    var position = { x: 5, y: 5 };
    this.map.setCell(position.x, position.y, CELL_EMPTY);
    this.worldState = new WorldState({
      facing: 'east',
      position: position,
      currentCell: null
    });
    this.actions = [
      new Walk(this, 'forward'),
      new Attack(this, 'forward')
    ];
    this.goals = [
      new ExplorationGoal(),
      new StairsGoal()
    ];
  }

  sense(warrior) {
    for (let i = 0; i < directions.length; i++) {
      var direction = directions[i];
      var position = {
        x: this.worldState.position.x,
        y: this.worldState.position.y
      };
      var space = warrior.feel(direction);
      switch (dirToCard(this.worldState.facing, direction)) {
        case 'east': position.x++; break;
        case 'north': position.y--; break;
        case 'west': position.x--; break;
        case 'south': position.y++; break;
      }
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
      this.map.setCell(position.x, position.y, cell);
      this.worldState[direction] = cell;
    }
    console.log(this.map.toString());
  }

  playTurn(warrior) {
    console.log('\n== TURN ' + this.turnCount + ' ==');
    this.sense(warrior);
    if (this.actions[0].canPerform(this.worldState))
      this.actions[0].perform(warrior, this.worldState);

    this.turnCount++;
  }
}
