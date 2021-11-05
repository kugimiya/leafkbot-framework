import { Vec3 } from 'vec3';
import { IProcessor } from '.';
import KBot from '../bot';
import { TaskType } from '../scheduler';
import { distanceTo, MAX_TO_BLOCK_DISTANCE, sleep, SLEEPTIME_AFTER_MOVE } from '../utils';

type Path = {
  position: Vec3,
  facingVector: Vec3,
  direction: string,
  iteration: number,
  iterationEnding: boolean,
};

type SubPath = {
  position: Vec3,
  facingVector: Vec3,
}

type ProcessParams = {
  startPosition?: Vec3,
  width?: number,
  platformTasksCb?: (
    iteration: number,
    spiralCenter: Vec3,
    bot: KBot, 
    startPosition: Vec3,
  ) => Promise<TaskType[]>,
};

export default class FencesProcessor extends IProcessor<Path> {
  generateBridge(startPosition?: Vec3, endPosition?: Vec3, direction?: string): SubPath[] {
    if (
      startPosition === undefined ||
      endPosition === undefined ||
      direction === undefined
    ) {
      throw new Error('Params missed');
    }

    let pos = startPosition;
    const path: SubPath[] = [];

    const buildAtX = async (x1: number, x2: number) => {
      for (let x = Math.round(x1 > x2 ? x1 : x2); x > Math.round(x1 > x2 ? x2 : x1); x -= 1) {
        path.push({
          position: pos.offset(0, -1, 0),
          facingVector: new Vec3(x1 > x2 ? -1 : 1, 0, 0),
        });

        pos = pos.offset(x1 > x2 ? -1 : 1, 0, 0);
      }
    }
    
    const buildAtZ = async (z1: number, z2: number) => {
      for (let x = Math.round(z1 > z2 ? z1 : z2); x > Math.round(z1 > z2 ? z2 : z1); x -= 1) {
        path.push({
          position: pos.offset(0, -1, 0),
          facingVector: new Vec3(0, 0, z1 > z2 ? -1 : 1),
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

  generateXBridgeStart(startPosition?: Vec3, direction?: string): [SubPath[], Vec3] {
    if (
      startPosition === undefined ||
      direction === undefined
    ) {
      throw new Error('Params missed');
    }

    const path = [];
    let nextPos = startPosition;

    if (direction === 'north') {
      // В данном случае ставится один блок сзади и один справа
      path.push({
        position: startPosition.offset(0, -1, -1),
        facingVector: new Vec3(0, 0, -1),
      });

      path.push({
        position: startPosition.offset(0, -1, -1),
        facingVector: new Vec3(1, 0, 0),
      });

      nextPos = startPosition.offset(1, 0, -1);
    }

    if (direction === 'west') {
      // В данном случае ставится один блок справа и один сзади
      path.push({
        position: startPosition.offset(0, -1, 0),
        facingVector: new Vec3(-1, 0, 0),
      });

      path.push({
        position: startPosition.offset(-1, -1, 0),
        facingVector: new Vec3(0, 0, -1),
      });

      nextPos = startPosition.offset(-1, 0, -1);
    }

    if (direction === 'east') {
      // В данном случае ставится один блок слева и один вперед
      path.push({
        position: startPosition.offset(0, -1, 0),
        facingVector: new Vec3(1, 0, 0),
      });

      path.push({
        position: startPosition.offset(1, -1, 0),
        facingVector: new Vec3(0, 0, 1),
      });

      nextPos = startPosition.offset(1, 0, 1);
    }

    return [path, nextPos];
  } 

  /**
   * Генерирует координаты пути
   */
  async createPath(
    startPosition?: Vec3,
    width?: number,
    directions?: Array<keyof typeof this.directions>
  ): Promise<Path[]> {
    if (
      startPosition === undefined ||
      width === undefined ||
      directions === undefined
    ) {
      throw new Error('Params missed');
    }

    const path: Path[] = [];
    let currentPosition = startPosition;
    let iteration = 0;

    for (let dir of directions) {
      const [offsetX, offsetZ] = this.directions[dir];
  
      for (let i = 0; i < width; i += 1) {
        path.push({
          position: currentPosition.offset(0, -1, 0),
          facingVector: new Vec3(0, 1, 0),
          direction: dir,
          iteration,
          iterationEnding: false,
        });

        path.push({
          position: currentPosition,
          facingVector: new Vec3(offsetX, 0, offsetZ),
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

  /**
   * Создаёт пул задач для процессинга пути
   */
  async processPath(params?: ProcessParams): Promise<TaskType[]> {
    if (
      params === undefined ||
      params?.startPosition === undefined ||
      params?.width === undefined ||
      params?.platformTasksCb === undefined
    ) {
      throw new Error('Params missed');
    }

    const { startPosition, width, platformTasksCb } = params;
    const tasks: TaskType[] = [];
    const spiralCenter = startPosition.offset((width / 2) * -1, 0, width / 2);
    const scaffoldPath = await this.createPath(
      startPosition.offset(0, 0, 1), 
      width, 
      ['south', 'west', 'north'],
    );

    // Helper
    const createBuildTask = (position: Vec3, facingVector: Vec3) => {
      const task: TaskType = async self => {
        this.debug(`Do block placing @ ${position}`);

        if (!self.blockIs('air', position.offset(facingVector.x, facingVector.y, facingVector.z))) {
          this.debug(`Skip block placing @ ${position}`);
          return;
        }

        await self.putBlockInMainHand('stone');
        const refBlock = self.bot.blockAt(position);

        if (refBlock) {
          await self.bot.placeBlock(refBlock, facingVector, () => {});
        }
      };

      return task;
    };

    // Goto start position
    tasks.push(async (self) => {
      this.debug(`Do moving @ ${startPosition}`);
      self.runPathfinder(new Vec3(startPosition.x, startPosition.y, startPosition.z));
      sleep(SLEEPTIME_AFTER_MOVE);
    });

    for (let pathPiece of scaffoldPath) {
      const { position, facingVector, direction, iteration, iterationEnding } = pathPiece;
      tasks.push(createBuildTask(position, facingVector));

      // Если это последняя итерация в ступеньке, значит делаем всякую штуку!
      if (!iterationEnding) {
        continue;
      }

      tasks.push(async self => {
        this.debug(`Do moving @ ${position}`);

        await self.runPathfinder(new Vec3(position.x, position.y, position.z));
        await sleep(SLEEPTIME_AFTER_MOVE);
      });

      // Если кратно 5, значит пришло время строить платформу!
      if (iteration % 5 !== 0) {
        continue;
      }

      // Начинаем с постройки пути до центра платформы
      this.debug(`Do path to center @ ${spiralCenter} ['y' dont make sense here]`);

      // Если это первый шаг, путь будет 'вылезать на' лестницу и мешать
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

        if (xBridgeStartPath !== undefined || nextStartPos !== undefined) {
          xBridgeStartPath.forEach((path) => tasks.push(createBuildTask(path.position, path.facingVector)));
  
          bridgePath = this.generateBridge(
            nextStartPos, 
            spiralCenter.offset(0, iteration, 0), 
            direction
          );
        }

      }

      bridgePath?.forEach((path) => {
        tasks.push(createBuildTask(path.position, path.facingVector));
        tasks.push(async self => {
          if (distanceTo(self.position, path.position) > MAX_TO_BLOCK_DISTANCE + 2) {
            const { x, y, z } = path.position.offset(0, 1, 0);
            await self.runPathfinder(new Vec3(x, y, z));
          }
        });
      });

      // Платформа
      (await platformTasksCb(
        iteration, 
        spiralCenter, 
        this.bot, 
        startPosition.offset(0, iteration, 0)
      )).forEach(t => tasks.push(t));

      tasks.push(async self => await self.runPathfinder(new Vec3(position.x, position.y, position.z)));
    }

    return tasks;
  }

  /**
   * Создаёт пул задач для процессинга пути 'в середине'
   */
  async hook(): Promise<TaskType[]> {
    return [];
  }
}
