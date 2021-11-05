import { Vec3 } from 'vec3';
import KBot from '../bot';
import { TaskType } from '../scheduler';

export default class IProcessor<T = Vec3> {
  DEBUG = true;

  directions = {
    south: [0,  1],
    west:  [-1, 0],
    north: [0, -1],
    east:  [1,  0],
  };

  constructor(readonly bot: KBot) {}

  debug(message: string) {
    if (this.DEBUG) {
      console.log(message);
    }
  }

  /**
   * Генерирует координаты пути
   */
  async createPath(): Promise<T[]> {
    return [];
  }

  /**
   * Создаёт пул задач для процессинга пути
   */
  async processPath(): Promise<TaskType[]> {
    return [];
  }

  /**
   * Создаёт пул задач для процессинга пути 'в середине'
   */
  async hook(): Promise<TaskType[]> {
    return [];
  }
}
