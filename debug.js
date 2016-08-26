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

class Enemy {
  constructor(type, position) {
    this.type = type;
    this.hp = 24;
    this.position = position;
    this.willAttack = false;
  }

  sense(warrior) {
    var diff = {
      x: warrior.position.x - this.position.x,
      y: warrior.position.y - this.position.y
    }
    this.willAttack = (diff.x*diff.x + diff.y*diff.y <= 1);
  }

  takeTurn(warrior) {
    if (!this.willAttack)
      return;
    var diff = {
      x: warrior.position.x - this.position.x,
      y: warrior.position.y - this.position.y
    }
    if (diff.x*diff.x + diff.y*diff.y <= 1) {
      warrior._health -= 3;
    }
  }
}

class Warrior {
  constructor() {
    this._health = 20;
    this.map = {
      width: 10,
      height: 3,
      tiles: Array.from('WWWWWWWWWW' +
                        'WC @ S aaW' +
                        'WWWWWWWWWW')
    }

    var position = { x: 1, y: 1 };

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        let tileIndex = y * this.map.width + x;
        let cellType = this.map.tiles[tileIndex];
        let tile = {
          type: cellType
        };

        if (cellType == '@') {
          tile.type = ' ';
          position = { x: x, y: y };
        } else if (cellType == 'S' || cellType == 'a') {
          tile.type = 'E';
          tile.enemy = new Enemy(cellType, { x: x, y: y });
          enemies.push(tile.enemy);
        }

        this.map.tiles[tileIndex] = tile;
      }
    }

    this.facing = 'east';
    this.position = position;
  }

  _getCell(x, y) {
    return this.map.tiles[x + y * this.map.width];
  }

  _setCell(x, y, value) {
    this.map.tiles[x + y * this.map.width] = value;
  }

  walk(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    if (this._getCell(position.x, position.y).type == ' ') {
      this.position = position;
    }
  }

  attack(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    var cell = this._getCell(position.x, position.y);
    var enemy = cell.enemy;
    if (enemy != null && (enemy.hp -= 5) <= 0) {
      this._setCell(position.x, position.y, {
        type: ' '
      });
    }
  }

  rescue(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    if (this._getCell(position.x, position.y).type == 'C') {
      this._setCell(position.x, position.y, {
        type: ' '
      });
    }
  }

  feel(direction) {
    var position = stepInDir(this.facing, direction, this.position);
    return new Space(this._getCell(position.x, position.y).type);
  }

  health() {
    return this._health;
  }

  rest() {
    this._health += 2;
  }
}

var enemies = [];
var player = new Player();
var warrior = new Warrior();

for (let i = 0; i < 100; i++) {
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].sense(warrior);
  }
  player.playTurn(warrior);
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].takeTurn(warrior);
  }
}
