const MinecraftData = require('minecraft-data');
const mineFlayer = require('mineflayer');
const { mineflayer: mineFlayerViewer } = require('prismarine-viewer');
const { pathfinder, Movements, goals: { GoalNearXZ, GoalNear } } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3');

class KBot {
  MAX_TO_BLOCK_DISTANCE = 4;
  SLEEPTIME_AFTER_MOVE = 25;

  /**
   * @type {mineFlayer.Bot}
   */
  bot;

  tasks = [];

  Vec3 = Vec3;

  /**
   * Bot Wrapper
   * @param {{ username, host, port, password }} params 
   */
  constructor(params) {
    // Range of moveTo goal
    this.rangeGoal = 1;

    this.bot = mineFlayer.createBot({
      version: '1.17.1',
      ...params,
    });

    this.mcData = MinecraftData(this.bot.version);
    this.defaultMove = new Movements(this.bot, this.mcData);
    this.accuracyMove = new Movements(this.bot, this.mcData);
    
    this.accuracyMove.canDig = false;
    this.accuracyMove.allow1by1towers = false;
    this.accuracyMove.allowFreeMotion = false;
    this.accuracyMove.allowParkour = false;
    this.accuracyMove.allowSprinting = false;

    this.bot.on('kicked', err => console.log('kicked', err));
    this.bot.on('error', err => console.log('error', err));
    this.bot.loadPlugin(pathfinder);
    this.bot.pathfinder.setMovements(this.defaultMove);

    this.bot.once('spawn', async () => {
      await this.bot.waitForChunksToLoad();
      mineFlayerViewer(this.bot, { port: 3007, firstPerson: false });
      this.taskRunner();
    });
  }

  sleep = (ms) => new Promise((res) => setTimeout(() => res(), ms));

  async taskRunner() {
    let isRun = false;

    let interval = setInterval(async () => {
      if (!this.tasks.length || isRun) {
        return;
      }

      isRun = true;
      await this.tasks.shift()(this);
      isRun = false;

      // console.log(`Tasks queue len: ${this.tasks.length}`);
    }, 2);

    this.stopRunner = () => {
      clearInterval(interval);
    };
  }

  moveTo(x, y, z) {
    return new Promise((res, rej) => {
      this.bot.pathfinder.setGoal(new GoalNear(x, y, z, this.rangeGoal));
      this.bot.once('goal_reached', () => res());
    });
  }

  _hard_moveTo(x, y, z) {
    return new Promise((res, rej) => {
      this.bot.pathfinder.setGoal(new GoalNearXZ(x, z, 0.2));
      this.bot.once('goal_reached', () => res());
    });
  }

  tryMoveTo(x, y, z) {
    return new Promise((res, rej) => {
      this.bot.pathfinder.setGoal(new GoalNearXZ(x, z, this.rangeGoal + 1));
      this.bot.once('goal_reached', () => res());
    });
  }

  async gotoBlock(refBlock) {
    this.bot.pathfinder.setMovements(this.accuracyMove);

    // Гипотенуза, да. А вы что думали?
    let distanceToBlk = Math.sqrt(
      Math.pow(this.bot.entity.position.x - refBlock.position.x, 2)
      + Math.pow(this.bot.entity.position.z - refBlock.position.z, 2)
    );

    distanceToBlk = Math.round(distanceToBlk * 1000) / 1000;

    if (distanceToBlk > this.MAX_TO_BLOCK_DISTANCE) {
      const distanceInPercents = 100 / (distanceToBlk / this.MAX_TO_BLOCK_DISTANCE);

      const distanceXToBlkInPerc = distanceInPercents * ((this.bot.entity.position.x - refBlock.position.x) / 100);
      const distanceZToBlkInPerc = distanceInPercents * ((this.bot.entity.position.z - refBlock.position.z) / 100);

      const nearestBlkPos = refBlock.position.offset(
        distanceXToBlkInPerc, 0, distanceZToBlkInPerc
      );

      await this._hard_moveTo(nearestBlkPos.x, this.bot.y, nearestBlkPos.z);
      await this.sleep(this.SLEEPTIME_AFTER_MOVE);
    }

    this.bot.pathfinder.setMovements(this.defaultMove);
  }

  /**
   * 
   * @param {string} command 
   * @param {(self: KBot) => void} handler 
   */
  addCommand(command, handler) {
    this.bot.on('chat', async (username, message) => {
      if (username === this.bot.username) return;
      if (message !== command) {
        if (!message.includes('#')) return;
      }
  
      await handler(this, username, message);
  
      this.bot.chat(`INFO: '${command}' to ${username} done;`);
    });
  }

  /**
   * 
   * @param {(self: KBot) => void} handler 
   */
  addTask(handler) {
    this.tasks.push(handler);
  }
}

module.exports = { KBot };
