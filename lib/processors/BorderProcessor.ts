import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { IProcessor } from '.';
import KBot from '../bot';
import { TaskType } from '../scheduler';
import { sleep, SLEEPTIME_AFTER_MOVE } from '../utils';

type ProcessParams = {
  vertexCoordinates?: [Vec3, Vec3], 
  blockSkipCb?: (refBlock: Block) => Promise<boolean>, 
  processorCb?: (self: KBot, refBlock: Block) => Promise<void>,
}

export default class BorderProcessor extends IProcessor {
  /**
   * Генерирует координаты пути
   */
  async createPath(vertexCoordinates?: Vec3[]): Promise<Vec3[]> {
    if (vertexCoordinates === undefined) {
      throw new Error('Params missed');
    }

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
  async processPath(params?: ProcessParams): Promise<TaskType[]> {
    if (
      params === undefined ||
      params?.vertexCoordinates === undefined ||
      params?.blockSkipCb === undefined ||
      params?.processorCb === undefined
    ) {
      throw new Error('Params missed');
    }

    const { vertexCoordinates, blockSkipCb, processorCb } = params;
    const tasks: TaskType[] = [];
    // Generate path
    const positions = await this.createPath(vertexCoordinates);
  
    // Than process
    positions.forEach(pos => {
      tasks.push(async self => {
        const refBlock = self.bot.blockAt(pos);

        if (!refBlock) {
          return;
        }
        
        if (await blockSkipCb(refBlock)) {
          return;
        }

        await self.comeToBlock(refBlock);
        await sleep(SLEEPTIME_AFTER_MOVE);
  
        await processorCb(self, refBlock);
      });
    });

    return tasks;
  }
}
