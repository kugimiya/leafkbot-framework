class KBotManager {
  DEBUG = true;

  MAX_TO_BLOCK_DISTANCE = 4;
  SLEEPTIME_AFTER_MOVE = 25;

  directions = {
    south: [0,  1],
    west:  [-1, 0],
    north: [0, -1],
    east:  [1,  0],
  };

  constructor(kbot) {
    this.kbot = kbot;
  }

  debug(msg) {
    console.log(msg);
  }

  generateBridge(startPosition, endPosition, direction) {
    let pos = startPosition;
    const path = [];

    const buildAtX = async (x1, x2) => {
      for (let x = Math.round(x1 > x2 ? x1 : x2); x > Math.round(x1 > x2 ? x2 : x1); x -= 1) {
        path.push({
          position: pos.offset(0, -1, 0),
          facingVector: new this.kbot.Vec3(x1 > x2 ? -1 : 1, 0, 0),
        });

        pos = pos.offset(x1 > x2 ? -1 : 1, 0, 0);
      }
    }
    
    const buildAtZ = async (z1, z2) => {
      for (let x = Math.round(z1 > z2 ? z1 : z2); x > Math.round(z1 > z2 ? z2 : z1); x -= 1) {
        path.push({
          position: pos.offset(0, -1, 0),
          facingVector: new this.kbot.Vec3(0, 0, z1 > z2 ? -1 : 1),
        });

        pos = pos.offset(0, 0, z1 > z2 ? -1 : 1);
      }
    }

    if (direction === 'south' || direction === 'north') {
      buildAtX(startPosition.x, endPosition.x);
      buildAtZ(startPosition.z, endPosition.z);
    } else {
      buildAtZ(startPosition.z, endPosition.z);
      buildAtX(startPosition.x, endPosition.x);
    }

    return path;
  }

  generateXBridgeStart(startPosition, direction) {
    const path = [];
    let nextPos;

    if (direction === 'south') {
      nextPos = startPosition;
    }

    if (direction === 'north') {
      // В данном случае ставится один блок сзади и один справа
      path.push({
        position: startPosition.offset(0, -1, -1),
        facingVector: new this.kbot.Vec3(0, 0, -1),
      });

      path.push({
        position: startPosition.offset(0, -1, -1),
        facingVector: new this.kbot.Vec3(1, 0, 0),
      });

      nextPos = startPosition.offset(1, 0, -1);
    }

    if (direction === 'west') {
      // В данном случае ставится один блок справа и один сзади
      path.push({
        position: startPosition.offset(0, -1, 0),
        facingVector: new this.kbot.Vec3(-1, 0, 0),
      });

      path.push({
        position: startPosition.offset(-1, -1, 0),
        facingVector: new this.kbot.Vec3(0, 0, -1),
      });

      nextPos = startPosition.offset(-1, 0, -1);
    }

    if (direction === 'east') {
      // В данном случае ставится один блок слева и один вперед
      path.push({
        position: startPosition.offset(0, -1, 0),
        facingVector: new this.kbot.Vec3(1, 0, 0),
      });

      path.push({
        position: startPosition.offset(1, -1, 0),
        facingVector: new this.kbot.Vec3(0, 0, 1),
      });

      nextPos = startPosition.offset(1, 0, 1);
    }

    return [path, nextPos];
  } 

  async generateScaffoldPath(startPosition, width, directions) {
    const path = [];
    let currentPosition = startPosition;
    let iteration = 0;

    for (let dir of directions) {
      const [offsetX, offsetZ] = this.directions[dir];
  
      for (let i = 0; i < width; i += 1) {
        path.push({
          position: currentPosition.offset(0, -1, 0),
          facingVector: new this.kbot.Vec3(0, 1, 0),
          direction: dir,
          iteration,
          iterationEnding: false,
        });

        path.push({
          position: currentPosition,
          facingVector: new this.kbot.Vec3(offsetX, 0, offsetZ),
          direction: dir,
          iteration,
          iterationEnding: true,
        });

        currentPosition = currentPosition.offset(offsetX, 1, offsetZ);

        iteration += 1;
      }
    }

    return path;
  }

  async processScaffoldPath(startPosition, width = 20, platformTasksCb) {
    const createBuildTask = (position, facingVector) => {
      return async _self => {
        this.debug(`Do block placing @ ${position}`);

        if (!_self.isAir(_self.bot.blockAt(position.offset(facingVector.x, facingVector.y, facingVector.z)))) {
          this.debug(`Skip block placing @ ${position}`);
          return;
        }

        await _self.switchBlock(_self.mcData.blocksByName['stone'].id);
        await _self.bot.placeBlock(_self.bot.blockAt(position), facingVector, () => {});
      }
    };

    const tasks = [];
    const spiralCenter = startPosition.offset((width / 2) * -1, 0, width / 2);

    // Goto start position
    const gotoStartPositionTask = async (_self) => {
      this.debug(`Do moving @ ${startPosition}`);
      _self.moveTo(startPosition.x, startPosition.y, startPosition.z);
      _self.sleep(this.SLEEPTIME_AFTER_MOVE);
    }

    const scaffoldPath = await this.generateScaffoldPath(
      startPosition.offset(0, 0, 1), 
      width, 
      ['south', 'west', 'north'],
    );

    for (let pathPiece of scaffoldPath) {
      const { position, facingVector, direction, iteration, iterationEnding } = pathPiece;
      tasks.push(createBuildTask(position, facingVector));

      // Если это последняя итерация в ступеньке, значит делаем всякую штуку!
      if (!iterationEnding) {
        continue;
      }

      tasks.push(async _self => {
        this.debug(`Do moving @ ${position}`);

        await _self.moveTo(position.x, position.y, position.z);
        await _self.sleep(this.SLEEPTIME_AFTER_MOVE);
      });

      // Если кратно 5, значит пришло время строить платформу!
      if (iteration % 5 !== 0) {
        continue;
      }

      // Начинаем с постройки пути до центра платформы
      this.debug(`Do path to center @ ${spiralCenter} ['y' dont make sense here]`);

      // Если это первый шаг, путь будет "вылезать на" лестницу и мешать
      // Надо создавать из немного иной позиции 
      let bridgePath;

      if (iteration % width !== 0) {
        bridgePath = this.generateBridge(
          position, 
          spiralCenter.offset(0, iteration, 0), 
          direction
        );
      } else {
        const [xBridgeStartPath, nextStartPos] = this.generateXBridgeStart(position, direction);
        xBridgeStartPath.forEach((path) => tasks.push(createBuildTask(path.position, path.facingVector)));

        bridgePath = this.generateBridge(
          nextStartPos, 
          spiralCenter.offset(0, iteration, 0), 
          direction
        );
      }

      bridgePath.forEach((path) => {
        tasks.push(createBuildTask(path.position, path.facingVector));
        tasks.push(async _self => {
          if (_self.distanseToVec3(path.position) > this.MAX_TO_BLOCK_DISTANCE + 2) {
            const { x, y, z } = path.position.offset(0, 1, 0);
            await _self.moveTo(x, y, z);
          }
        });
      });

      // Платформа
      const platformTasks = await platformTasksCb(
        iteration, 
        spiralCenter, 
        this.kbot, 
        startPosition.offset(0, iteration, 0)
      );
      platformTasks.forEach(t => tasks.push(t));

      tasks.push(async _self => await _self.moveTo(position.x, position.y, position.z));
    }

    this.kbot.addTask(gotoStartPositionTask);
    tasks.forEach(task => this.kbot.addTask(task));
  }

  /**
   * Генерирует координаты ограничителей роста кактусов
   * 
   * @param {Vec3} startVertex - Координаты верхнего-левого угла
   * @param {Vec3} endVertex - Координаты нижнего-правого угла
   */
  async generateFencesPath(startVertex, endVertex) {
    // Array with Vec3 for targets
    const positionsForFill = [];

    for (let x = startVertex.x; x >= endVertex.x; x -= 4) {
      for (let z = startVertex.z; z <= endVertex.z; z += 1) {
        positionsForFill.push(new this.kbot.Vec3(x, startVertex.y + 1, z));
      }
    }

    return positionsForFill;
  }

  /**
   * Процессит ограничители роста кактусов
   * 
   * @param {Vec3[]} vertexCoordinates - Координаты верхнего-левого угла и Координаты нижнего-правого угла
   * @param {number} blockId - айди блока, которым строить
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb - Сам процессор блока (ломает/ставит/etc)
   */
  async processFencesPath(vertexCoordinates, blockId, processorCb) {
    const tasks = [];

    // Generate path
    const positions = await this.generateFundamentPath(vertexCoordinates[0], vertexCoordinates[1]);

    // Than process
    positions.forEach(pos => {
      tasks.push(async (_self) => {
        if (!_self.isAir(_self.bot.blockAt(pos.offset(0, 0, 1)))) {
          return;
        }

        await _self.switchBlock(blockId);
        await _self.gotoBlock(_self.bot.blockAt(new _self.Vec3(pos.x, vertexCoordinates[0].y - 1, pos.z)));
        await _self.sleep(this.SLEEPTIME_AFTER_MOVE);

        const refBlock = _self.bot.blockAt(pos);
        await processorCb(_self, refBlock);
      });
    });

    return tasks;
  }

  /**
   * Генерирует координаты фундамента (я пока не определился, как правильно называть эти столбики-основания х))
   * 
   * @param {Vec3} startVertex - Координаты верхнего-левого угла
   * @param {Vec3} endVertex - Координаты нижнего-правого угла
   */
  async generateFundamentPath(startVertex, endVertex) {
    // Array with Vec3 for targets
    const positionsForFill = [];

    for (let x = startVertex.x; x >= endVertex.x; x -= 2) {
      for (let z = startVertex.z; z <= endVertex.z; z += 2) {
        positionsForFill.push(new this.kbot.Vec3(x, startVertex.y, z));
      }
    }

    return positionsForFill;
  }

  /**
   * Процессит фундамент (я пока не определился, как правильно называть эти столбики-основания х))
   * 
   * @param {Vec3[]} vertexCoordinates - Координаты верхнего-левого угла и Координаты нижнего-правого угла
   * @param {number} blockId - айди блока, которым строить
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb - Сам процессор блока (ломает/ставит/etc)
   */
  async processFundamentPath(vertexCoordinates, blockId, processorCb) {
    const tasks = [];

    // Generate path
    const positions = await this.generateFundamentPath(vertexCoordinates[0], vertexCoordinates[1]);

    // Than process
    positions.forEach(pos => {
      tasks.push(async (_self) => {
        if (!_self.isAir(_self.bot.blockAt(pos.offset(0, 1, 0)))) {
          return;
        }

        await _self.switchBlock(blockId);
        await _self.gotoBlock(_self.bot.blockAt(new _self.Vec3(pos.x, vertexCoordinates[0].y, pos.z)));
        await _self.sleep(this.SLEEPTIME_AFTER_MOVE);

        const refBlock = _self.bot.blockAt(pos);
        await processorCb(_self, refBlock);
      });
    });

    return tasks;
  }

  /**
   * Генерирует координаты бордера
   * 
   * @param {Vec3[]} vertexCoordinates Координаты верхнего-левого угла и нижнего-правого угла
   * @returns {Array<Vec3>}
   */
  async generateBorderPath(vertexCoordinates) {
    // Array with Vec3 for targets
    const positionsForFill = [];

    // Just offsets-by-direction for code-readability
    const directionsOffsets = {
      south: { x: 0,  z: 1,  y: 0 },
      west:  { x: -1, z: 0,  y: 0 },
      north: { x: 0,  z: -1, y: 0 },
      east:  { x: 1,  z: 0,  y: 0 },
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
   * Создаёт пул задач для процессинга рамки в заданных координатах
   * 
   * @param {[Vec3, Vec3]} vertexCoordinates Координаты верхнего-левого угла и нижнего-правого угла
   * @param {async (refBlock: Block) => Promise<boolean>} blockSkipCb - Должен ответить, нужно ли скипать блок
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb - Сам процессор блока (ломает/ставит/etc)
   */
  async processBorderPath(vertexCoordinates, blockSkipCb, processorCb) {
    const tasks = [];

    // Generate path
    const positions = await this.generateBorderPath(vertexCoordinates);
  
    // Than process
    positions.forEach(pos => {
      tasks.push(async (_self) => {
        const refBlock = _self.bot.blockAt(pos);
        
        if (await blockSkipCb(refBlock)) {
          return;
        }

        await _self.gotoBlock(refBlock);
        await _self.sleep(this.SLEEPTIME_AFTER_MOVE);
  
        await processorCb(_self, refBlock);
      });
    });

    return tasks;
  }

  /**
   * Генерирует координаты спирального пути
   * 
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

  /**
   * Создаёт пул задач для процессинга спирального пути в заданных координатах
   * 
   * @param {Vec3} startPosition 
   * @param {number} width 
   * @param {async (refBlock: Block) => Promise<boolean>} blockSkipCb - Должен ответить, нужно ли скипать блок
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} processorCb - Сам процессор блока (ломает/ставит/etc)
   * @param {async (_self: KBot, refBlock: Block) => Promise<void>} startBlockCb - Пост-процессор начального блока (центра спирали)
   */
  async processSpiralPath(startPosition, width, blockSkipCb, processorCb, startBlockCb) {
    const tasks = [];

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
      tasks.push(async (_self) => {
        const refBlock = _self.bot.blockAt(pos);
        
        if (await blockSkipCb(refBlock)) {
          return;
        }
        
        // Гипотенуза, да. А вы что думали?
        let distanceToBlk = _self.distanseToVec3(refBlock.position);
        
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
  
    tasks.push(async (_self) => {
      await _self._hard_moveTo(startPosition.x, startPosition.y, startPosition.z);
      await _self.sleep(this.SLEEPTIME_AFTER_MOVE);
      await startBlockCb(_self, _self.bot.blockAt(startPosition.offset(0, -1, 0)));
    });

    return tasks;
  }
}

module.exports = { KBotManager };