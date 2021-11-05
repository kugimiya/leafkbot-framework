import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { IProcessor } from '.';
import KBot from '../bot';
import { TaskType } from '../scheduler';
import { distanceTo, MAX_TO_BLOCK_DISTANCE, sleep, SLEEPTIME_AFTER_MOVE } from '../utils';

type ProcessParams = {
  startPosition?: Vec3, 
  width?: number, 
  blockSkipCb?: (refBlock: Block | null) => Promise<boolean>, 
  processorCb?: (_self: KBot, refBlock: Block | null) => Promise<void>, 
  startBlockCb?: (_self: KBot, refBlock: Block | null) => Promise<void>,
};

export default class SpiralProcessor extends IProcessor {
  /**
   * Генерирует координаты спирального пути
   * 
   * @param {number} width 
   * @param {Vec3} position
   */
  async createPath(width = 8, position?: Vec3): Promise<Vec3[]> {
    if (width === undefined || position === undefined) {
      throw new Error('Params missed');
    }

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

    const startPosition = position;

    // Just offsets-by-direction for code-readability
    const directionsOffsets = {
      south: { x: 0,  z: 1,  y: 0 },
      north: { x: 0,  z: -1, y: 0 },
      east:  { x: 1,  z: 0,  y: 0 },
      west:  { x: -1, z: 0,  y: 0 },
    };
      
    // We need this definitions for 'flip' currentDirection to next axis
    const directionsChain: Record<
      keyof typeof directionsOffsets, 
      keyof typeof directionsOffsets
    > = {
      west: 'north',
      north: 'east',
      east: 'south',
      south: 'west',
    };

    // Array with Vec3 for targets
    const positionsForFill = [];

    let currentPosition = startPosition.offset(1, -1, 1);
    let currentDirection: keyof typeof directionsOffsets = 'west';

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
   */
  async processPath(params?: ProcessParams): Promise<TaskType[]> {
    if (
      params === undefined ||
      params?.startPosition === undefined ||
      params?.width === undefined ||
      params?.blockSkipCb === undefined ||
      params?.processorCb === undefined ||
      params?.startBlockCb === undefined
    ) {
      throw new Error('Params missed');
    }

    const { startPosition, width, blockSkipCb, processorCb, startBlockCb } = params;
    const tasks: TaskType[] = [];
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
    const positions = await this.createPath(width, startPosition);
  
    // Than process
    positions.forEach(pos => {
      tasks.push(async self => {
        const refBlock = self.bot.blockAt(pos);

        if (refBlock === null) {
          return;
        }
        
        if (await blockSkipCb(refBlock)) {
          return;
        }
        
        // Гипотенуза, да. А вы что думали?
        let distanceToBlk = distanceTo(self.position, refBlock.position);
        
        // find nearest blk and goto it
        if (distanceToBlk > MAX_TO_BLOCK_DISTANCE) {
          let nearestBlkPos;
          let yOffset = 0;
          
          while (!nearestBlkPos?.x) {
            for (let offset of offsets) {
              const trgBlk = self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + yOffset, offset.z));
              const upperTrgBlk0 = self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + 1 + yOffset, offset.z));
              const upperTrgBlk1 = self.bot.blockAt(refBlock.position.offset(offset.x, offset.y + 2 + yOffset, offset.z));

              if (trgBlk === null || upperTrgBlk0 === null || upperTrgBlk1 === null) {
                break;
              }
  
              if (trgBlk.displayName !== 'Air' && upperTrgBlk0.displayName === 'Air' && upperTrgBlk1.displayName === 'Air') {
                nearestBlkPos = trgBlk.position.offset(0, 0, 0);
                break;
              }
            }
  
            if (!nearestBlkPos?.x) {
              yOffset += 1;
            } 
          }
  
          await self.runPathfinder(new Vec3(nearestBlkPos.x, nearestBlkPos.y + 1, nearestBlkPos.z), 0.2);
          await sleep(SLEEPTIME_AFTER_MOVE);
        }
  
        await processorCb(self, refBlock);
      });
    });
  
    tasks.push(async (self) => {
      await self.runPathfinder(new Vec3(startPosition.x, startPosition.y, startPosition.z));
      await sleep(SLEEPTIME_AFTER_MOVE);
      await startBlockCb(self, self.bot.blockAt(startPosition.offset(0, -1, 0)));
    });

    return tasks;
  }
}
