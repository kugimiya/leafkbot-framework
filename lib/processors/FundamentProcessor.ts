import { Block } from "prismarine-block";
import { Vec3 } from "vec3";
import KBot from "../bot";
import { TaskType } from "../scheduler";
import { sleep, SLEEPTIME_AFTER_MOVE } from "../utils";
import { BlockName } from "../types/blockName";
import { IProcessor } from ".";

export default class FundamentProcessor extends IProcessor {
  /**
   * Генерирует координаты фундамента (я пока не определился, как правильно называть эти столбики-основания х))
   * 
   * @param {Vec3} startVertex - Координаты верхнего-левого угла
   * @param {Vec3} endVertex - Координаты нижнего-правого угла
   */
  async createPath(startVertex?: Vec3, endVertex?: Vec3): Promise<Vec3[]> {
    if (
      startVertex === undefined ||
      endVertex === undefined
    ) {
      throw new Error('Params missed');
    }

    // Array with Vec3 for targets
    const positionsForFill: Vec3[] = [];

    for (let x = startVertex.x; x >= endVertex.x; x -= 2) {
      for (let z = startVertex.z; z <= endVertex.z; z += 2) {
        positionsForFill.push(new Vec3(x, startVertex.y, z));
      }
    }

    return positionsForFill;
  }

  /**
   * Процессит фундамент (я пока не определился, как правильно называть эти столбики-основания х))
   * 
   * @param {Vec3[]} vertexCoordinates - Координаты верхнего-левого угла и Координаты нижнего-правого угла
   * @param {BlockName} blockId - айди блока, которым строить
   * @param {async (self: KBot, refBlock: Block) => Promise<void>} processorCb - Сам процессор блока (ломает/ставит/etc)
   */
  async processPath(
    vertexCoordinates?: Vec3[], 
    blockId?: BlockName,
    processorCb?: (self: KBot, refBlock: Block) => Promise<void>
  ): Promise<TaskType[]> {
    if (
      vertexCoordinates === undefined ||
      blockId === undefined ||
      processorCb === undefined
    ) {
      throw new Error('Params missed');
    }

    const tasks: TaskType[] = [];

    // Generate path
    const positions = await this.createPath(vertexCoordinates[0], vertexCoordinates[1]);

    // Than process
    positions.forEach(pos => {
      tasks.push(async (self) => {
        if (!self.blockIs('air', pos.offset(0, 1, 0))) {
          return;
        }

        await self.putBlockInMainHand(blockId);
        await self.comeToBlock(self.bot.blockAt(new Vec3(pos.x, vertexCoordinates[0].y, pos.z)));
        await sleep(SLEEPTIME_AFTER_MOVE);

        const refBlock = self.bot.blockAt(pos);

        if (refBlock) {
          await processorCb(self, refBlock);
        }
      });
    });

    return tasks;
  }
}
