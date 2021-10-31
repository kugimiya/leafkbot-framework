class KBotManager {
  MAX_TO_BLOCK_DISTANCE = 4;
  SLEEPTIME_AFTER_MOVE = 25;

  constructor(kbot) {
    this.kbot = kbot;
  }

  async pushTasks(tasks) {
    (await tasks).forEach(task => this.kbot.addTask(task));
    console.log('new tasks pull length: ', (await tasks).length);
  }

  /**
   * Generate spiral path
   * @param {number} width 
   * @param {Vec3} _position 
   * @returns {Array<Vec3>}
   */
  async generateSpiralPath(width = 8, _position) {
    /*
      `startPosition` is fillment with width = 1 parameter.
      Let me show you placement for width = 5:

      z
      |
      | 5 4 4 4 4
      | 5 3 2 2 4
      | 5 3 1 2 4
      | 5 3 3 3 4
      | 5 5 5 5 5
    -|------------> x

      I think 'spiral-method' is optimal method, but idk how to code this, but I see pattern
      So I try somethink
    */

    const startPosition = _position;

    // Just offsets-by-direction for code-readability
    const directionsOffsets = {
      south: { x: 0,  z: 1,  y: 0 },
      north: { x: 0,  z: -1, y: 0 },
      east:  { x: 1,  z: 0,  y: 0 },
      west:  { x: -1, z: 0,  y: 0 },
    };
      
    // We need this definitions for 'flip' currentDirection to next axis
    const directionsChain = {
      west: 'north',
      north: 'east',
      east: 'south',
      south: 'west',
    };

    // Array with Vec3 for targets
    const positionsForFill = [];

    let currentPosition = startPosition.offset(1, -1, 1);
    let currentDirection = 'west';

    // Target positions generation
    for (let i = 2; i <= width; i++) {
      // Hmm, packed spagetti-code!
      for (let axis of ['x', 'z']) {
        // Z-axis should calculate smaller amount of blocks (N - 1)
        const limit = axis === 'z' ? i - 1 : i;

        for (let j = 0; j < limit; j++) {
          currentPosition = currentPosition.offset(
            directionsOffsets[currentDirection].x,
            directionsOffsets[currentDirection].y,
            directionsOffsets[currentDirection].z,
          );
    
          positionsForFill.push(currentPosition);
        }
        
        // Special magic offset for next loop-rounds
        if (axis === 'z') {
          currentPosition = currentPosition.offset(
            currentDirection === 'south' ? 1 : -1,
            directionsOffsets[currentDirection].y,
            directionsOffsets[currentDirection].z,
          );
        }
        
        // Change axis :^)
        currentDirection = directionsChain[currentDirection];
      }
    }

    return positionsForFill;
  }

  async generateBorderPath(vertexCoordinates) {
    // Array with Vec3 for targets
    const positionsForFill = [];

    let startPosition = vertexCoordinates[0];

    // Just offsets-by-direction for code-readability
    const directionsOffsets = {
      south: { x: 0,  z: 1,  y: 0 },
      north: { x: 0,  z: -1, y: 0 },
      east:  { x: 1,  z: 0,  y: 0 },
      west:  { x: -1, z: 0,  y: 0 },
    };

    for (let dirKey in directionsOffsets) {
      if (dirKey === 'south') {
        for (let z = vertexCoordinates[0].z; z <= vertexCoordinates[1].z; z += 1) {
          positionsForFill.push(
            vertexCoordinates[0].offset(0, 0, Math.round(z) - Math.round(vertexCoordinates[0].z))
          );
        }
      }

      if (dirKey === 'north') {
        for (let z = vertexCoordinates[1].z; z >= vertexCoordinates[0].z; z -= 1) {
          positionsForFill.push(
            vertexCoordinates[1].offset(0, 0, Math.round(z) - Math.round(vertexCoordinates[1].z))
          );
        }
      }

      if (dirKey === 'east') {
        for (let x = vertexCoordinates[1].x; x <= vertexCoordinates[0].x; x += 1) {
          positionsForFill.push(
            vertexCoordinates[0].offset(Math.round(x) - Math.round(vertexCoordinates[0].x), 0, 0)
          );
        }
      }

      if (dirKey === 'west') {
        for (let x = vertexCoordinates[0].x; x >= vertexCoordinates[1].x; x -= 1) {
          positionsForFill.push(
            vertexCoordinates[1].offset(Math.round(x) - Math.round(vertexCoordinates[1].x), 0, 0)
          );
        }
      }
    }

    return positionsForFill;
  }

  /**
   * Создаёт пул задач для создания рамки в заданных координатах
   * 
   * @param {[Vec3, Vec3]} vertexCoordinates 
   * @param {async (refBlock: Block) => Promise<boolean>} blockSkipCb 
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb
   */
  async processBorder(vertexCoordinates, blockSkipCb, processorCb) {
    const offsets = [
      { x: 1,  y: 0, z: 0  },
      { x: 1,  y: 0, z: 1  },
      { x: 1,  y: 0, z: -1 },
      { x: -1, y: 0, z: 0  },
      { x: -1, y: 0, z: 1  },
      { x: -1, y: 0, z: -1 },
      { x: 0,  y: 0, z: 0  },
      { x: 0,  y: 0, z: 1  },
      { x: 0,  y: 0, z: -1 }
    ];
  
    // Generate path
    const positions = await this.generateBorderPath(vertexCoordinates);

    console.log(positions)
  
    // Than process
    positions.forEach(pos => {
      this.kbot.addTask(async (_self) => {
        const refBlock = _self.bot.blockAt(pos);
        
        if (await blockSkipCb(refBlock)) {
          return;
        }

        await _self.gotoBlock(refBlock);
  
        await processorCb(_self, refBlock);
      });
    });
  }

  /**
   * Processing spiral path by calling callbacks:
   *  - first cb verify term 'should bot process refBlock'
   *  - second cb doing process
   * 
   * @param {Vec3} startPosition 
   * @param {number} width 
   * @param {async (refBlock: Block) => Promise<boolean>} blockSkipCb 
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} startBlockCb 
   */
  async processSpiralPath(startPosition, width, blockSkipCb, processorCb, startBlockCb) {
    const offsets = [
      { x: 1,  y: 0, z: 0 },
      { x: 1,  y: 0, z: 1 },
      { x: 1,  y: 0, z: -1 },
      { x: -1, y: 0, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: -1, y: 0, z: -1 },
      { x: 0,  y: 0, z: 0 },
      { x: 0,  y: 0, z: 1 },
      { x: 0,  y: 0, z: -1 }
    ];
  
    // Generate path
    const positions = await this.generateSpiralPath(width, startPosition);
  
    // Than process
    positions.forEach(pos => {
      this.kbot.addTask(async (_self) => {
        const refBlock = _self.bot.blockAt(pos);
        
        if (await blockSkipCb(refBlock)) {
          return;
        }
        
        // Гипотенуза, да. А вы что думали?
        let distanceToBlk = Math.sqrt(
          Math.pow(_self.bot.entity.position.x - refBlock.position.x, 2)
          + Math.pow(_self.bot.entity.position.z - refBlock.position.z, 2)
        );
  
        distanceToBlk = Math.round(distanceToBlk * 1000) / 1000;
        
        // find nearest blk and goto it
        if (distanceToBlk > this.MAX_TO_BLOCK_DISTANCE) {
          let nearestBlkPos;
          let yOffset = 0;
          
          while (!nearestBlkPos?.x) {
            for (let offset of offsets) {
              const trgBlk = _self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + yOffset, offset.z));
              const upperTrgBlk0 = _self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + 1 + yOffset, offset.z));
              const upperTrgBlk1 = _self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + 2 + yOffset, offset.z));
  
              if (trgBlk.displayName !== 'Air' && upperTrgBlk0.displayName === 'Air' && upperTrgBlk1.displayName === 'Air') {
                nearestBlkPos = trgBlk.position.offset(0, 0, 0);
                break;
              }
            }
  
            if (!nearestBlkPos?.x) {
              yOffset += 1;
            } 
          }
  
          await _self._hard_moveTo(nearestBlkPos.x, nearestBlkPos.y + 1, nearestBlkPos.z);
          await _self.sleep(this.SLEEPTIME_AFTER_MOVE);
        }
  
        await processorCb(_self, refBlock);
      });
    });
  
    this.kbot.addTask(async (_self) => {
      await _self._hard_moveTo(startPosition.x, startPosition.y, startPosition.z);
      await _self.sleep(this.SLEEPTIME_AFTER_MOVE);
      await startBlockCb(_self, _self.bot.blockAt(startPosition.offset(0, -1, 0)));
    });
  }
}

module.exports = { KBotManager };