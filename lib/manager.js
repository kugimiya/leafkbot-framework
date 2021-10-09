class KBotManager {
  constructor(kbot) {
    this.kbot = kbot;
  }

  async pushTasks(tasks) {
    (await tasks).forEach(task => this.kbot.addTask(task));

    console.log('new tasks pull length: ', (await tasks).length);
  }

  /**
   * Calls `cb` and pass coordinates of W x H cube
   * @param {number} w 
   * @param {number} h 
   * @param {async (x: number, y: number, z: number) => Promise<void>} cb 
   */
  async offsetGenerator(w, h, cb) {
    for (let yOffset = 0; yOffset <= h; yOffset++) {
      for (let xOffset = 0; xOffset <= w; xOffset++) {
        for (let zOffset = 0; zOffset <= w; zOffset++) {
          await cb(xOffset, yOffset, zOffset);
        }
      }
    }
  }

  /**
   * Creates tasks that dig W x H cube
   * @param {number} w 
   * @param {number} h 
   * @param {Vec3} position 
   * @returns {Promise<Array<async () => Promise<unknown>>>}
   */
  async clearTasksGen(w, h, position) {
    const tasks = [];
    const taskGen = (_position, [_x, _y, _z]) => {
      return async (_self) => {
        const posWithOffset = _position.offset(_x, _y * -1, _z);
        const refBlock = _self.bot.blockAt(posWithOffset);
  
        const { x: mX, y: mY, z: mZ } = posWithOffset.offset(1, 1, 1);
  
        if (refBlock.displayName !== 'Air') {
          await _self.tryMoveTo(mX, mY, mZ);
          await _self.bot.dig(refBlock);
        }
      }
    }

    await this.offsetGenerator(w, h, async (x, y, z) => tasks.push(taskGen(position, [x, y, z])));
    return tasks;
  }

  /**
   * Creates tasks that build W x W border
   * @param {number} w 
   * @param {Vec3} position 
   * @param {{ heightOffset?: number, stayOnBlocks?: boolean }} options
   * @returns {Promise<Array<async () => Promise<unknown>>>}
   */
  async borderTasksGen(w, position, options = {}) {
    const defaultOptions = {
      // Use this when bot should build on specific Y-layer
      heightOffset: 0,
      // Use this when bot shouldnt walk on border that builds
      stayOnBlocks: false,
      // 
      ...options,
    };

    const tasks = [];
    const taskGen = (_position, _offset, _options, _dir) => {
      return async (_self) => {
        let refBlock = _self.bot.blockAt(_offset);
  
        if (refBlock.displayName === 'Air') {
          await _self.bot.placeBlock(refBlock, new _self.Vec3(0, 1, 0), () => {});
        }
        
        if (!_options.stayOnBlocks) {
          await _self.moveTo(_offset.x, _position.y, _offset.z);
        } else {
          let newOffset = _offset;

          if (_dir === 'south') {
            newOffset = newOffset.offset(1, 0, 0);
          } else if (_dir === 'east') {
            newOffset = newOffset.offset(0, 0, -1);
          } else if (_dir === 'north') {
            newOffset = newOffset.offset(-1, 0, 0);
          } else if (_dir === 'west') {
            newOffset = newOffset.offset(0, 0, 1);
          }
          
          await _self.tryMoveTo(newOffset.x, _position.y, newOffset.z);
        }
      }
    }

    for (let dir of ['south', 'east', 'north', 'west']) {
      let _offset, _x = 0, _y = defaultOptions.heightOffset, _z = 0;
  
      for (let i = 0; i <= w; i++) {
        if (dir === 'south') {
          _z = i;
          _x = 0;
        } else if (dir === 'east') {
          _z = w;
          _x = i;
        } else if (dir === 'north') {
          _z = w - i;
          _x = w;
        } else if (dir === 'west') {
          _z = 0;
          _x = w - i;
        }
  
        _offset = position.offset(_x, _y - 1, _z);
        tasks.push(taskGen(position, _offset, defaultOptions, dir));
      }
    }

    return tasks;
  }
}

module.exports = { KBotManager };