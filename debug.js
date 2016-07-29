'use strict';

class Space {
  constructor(value) {
    this.value = value;
  }

  isEmpty() { return this.value == ' '; }
  isStairs() { return this.value == '>'; }
  isEnemy() { return this.value == 'E'; }
  isCaptive() { return this.value == 'C'; }
  isWall() { return this.value == 'W'; }
  isTicking() { return this.value == 'T'; }
}

class Warrior {
  constructor() {
    this._health = 20;
    this.map = {
      width: 9,
      height: 3,
      tiles: Array.from('WWWWWWWWW' +
                        'W  EE E>W' +
                        'WWWWWWWWW')
    }

    this.facing = 'east';
    this.position = { x: 1, y: 1 };
  }

  _getCell(x, y) {
    return this.map.tiles[x + y * this.map.width];
  }

  _setCell(x, y, value) {
    this.map.tiles[x + y * this.map.width] = value;
  }

  walk(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    if (this._getCell(position.x, position.y) == ' ') {
      this.position = position;
    }
  }

  attack(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    if (this._getCell(position.x, position.y) == 'E') {
      this._setCell(position.x, position.y, ' ');
    }
    this._health -= 6;
  }

  feel(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    return new Space(this._getCell(position.x, position.y));
  }

  health() {
    return this._health;
  }

  rest() {
    this._health += 2;
  }
}

var player = new Player();
var warrior = new Warrior();

for (let i = 0; i < 10; i++) {
  debugger;
  player.playTurn(warrior);
}
