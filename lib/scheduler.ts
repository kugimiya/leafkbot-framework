import KBot from './bot';
import { IProcessor } from './processors';
import { Newable } from './types/Newable';

export type TaskType = (self: KBot) => Promise<void>;
export type CommandType = (self: KBot, username: string, message: string) => Promise<void>;

export default class KBotScheduler {
  tasks: TaskType[] = [];
  runnerInterval?: NodeJS.Timer;
  
  constructor(private bot: KBot) {}

  addTask(task: TaskType): void {
    this.tasks.push(task);
  }

  addCommand(command: string, handler: CommandType, forceRun = true): void {
    const bot = this.bot.bot;

    bot.on('chat', async (username, message) => {
      if (username === bot.username) {
        return;
      }

      if (message !== command) {
        return;
      }
  
      this.tasks.push(self => handler(self, username, message));

      if (forceRun) {
        this.startRunner();
      }
    });
  }

  startRunner(): void {
    let isRun = false;

    this.runnerInterval = setInterval(async () => {
      if (!this.tasks.length || isRun) {
        return;
      }

      isRun = true;
      const nextTask = this.tasks.shift();
      if (nextTask) {
        await nextTask(this.bot);
      }
      isRun = false;
    }, 1);
  }

  stopRunner(): void {
    if (this.runnerInterval) {
      clearInterval(this.runnerInterval);
    }
  }

  async runProcessor<T extends IProcessor>(
    processorClass: Newable<T>,
    ...processorArgs: Parameters<T['processPath']>
  ): Promise<void> {
    const processor = new processorClass(this.bot);
    const tasksGenerator = processor.processPath.bind(processor, ...processorArgs);

    this.tasks.concat(await tasksGenerator());
  }
}
