import MinecraftData, { IndexedData } from 'minecraft-data';
import { Bot, BotEvents, BotOptions, createBot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
// @ts-ignore
import { mineflayer as mineFlayerViewer } from 'prismarine-viewer';
import { Vec3 } from 'vec3';

import { distanceTo, makePedantikMovement, MAX_TO_BLOCK_DISTANCE, sleep, SLEEPTIME_AFTER_MOVE } from './utils';
import { BlockName } from './types/blockName';
import { Block } from 'prismarine-block';

export default class KBot {
  bot: Bot;
  data: IndexedData;
  movements: {
    default: Movements,
    pedantik: Movements,
  };

  constructor(params: BotOptions) {
    const defaultBotParams = {
      version: '1.17.1'
    };

    this.bot = createBot({
      ...defaultBotParams,
      ...params,
    });

    this.bot.on('kicked', err => console.log('Bot kicked: ', err));
    this.bot.on('error', err => console.log('Error taken: ', err));

    this.data = MinecraftData(defaultBotParams.version);

    this.movements = {
      default: new Movements(this.bot, this.data),
      pedantik: makePedantikMovement(this.bot, this.data),
    };
  }

  initPathfinder(): void {
    this.bot.loadPlugin(pathfinder);
    this.setMovements('default');
  }

  initWebViewer(port = 3007, firstPerson = false): void {
    mineFlayerViewer(this.bot, { port, firstPerson });
  }

  get position(): Vec3 {
    return this.bot.entity.position;
  }

  blockIs(name: BlockName, position?: Vec3): boolean {
    if (!position) {
      return false;
    }

    return this.bot.blockAt(position)?.name === name;
  }

  setMovements(key: keyof KBot['movements']): void {
    this.bot.pathfinder.setMovements(this.movements[key]);
  }

  runPathfinder(
    { x, y, z }: Vec3, 
    rangeGoal = 1, 
    goal?: 'near' | 'nearxz'
  ): Promise<void> {
    return new Promise(res => {
      const goalInstance = goal === 'near' || goal === undefined 
        ? new goals.GoalNear(x, y, z, rangeGoal) 
        : new goals.GoalNearXZ(x, z, rangeGoal);

      this.bot.pathfinder.setGoal(goalInstance);
      this.bot.once('goal_reached' as unknown as keyof BotEvents, () => res());
    });
  }

  async putBlockInMainHand(name: BlockName): Promise<void> {
    const blockId = this.data.blocksByName[name]?.id;
    const item = await this.bot.inventory.findInventoryItem(blockId, null, false);

    if (!item) {
      return;
    }

    await this.bot.equip(item, 'hand', (err) => {
      if (err) {
        console.error(`BLOCK EQUIP ERROR: name:${name} id:${blockId}`);
      }
    });
  }

  async comeToBlock(refBlock?: Block | null): Promise<void> {
    if (!refBlock) {
      return;
    }

    const distanceToBlk = distanceTo(this.position, refBlock.position);

    if (distanceToBlk < MAX_TO_BLOCK_DISTANCE) {
      return;
    }

    // TODO: clean spagetti code

    this.setMovements('pedantik');
    
    let nearestBlkPosValid = false;
    let nearestBlkPos;
    let distanceInPercents = 100 / (distanceToBlk / MAX_TO_BLOCK_DISTANCE);

    while (!nearestBlkPosValid) {
      const distanceXToBlkInPerc = distanceInPercents * ((this.position.x - refBlock.position.x) / 100);
      const distanceZToBlkInPerc = distanceInPercents * ((this.position.z - refBlock.position.z) / 100);

      nearestBlkPos = refBlock.position.offset(
        distanceXToBlkInPerc, 0, distanceZToBlkInPerc
      );

      if (!this.blockIs('air', nearestBlkPos)) {
        distanceInPercents -= 0.01;
      } else {
        nearestBlkPosValid = true;
      }
    }

    if (!nearestBlkPos) {
      this.setMovements('default');
      return;
    }

    await this.runPathfinder(new Vec3(nearestBlkPos.x, this.position.y, nearestBlkPos.z), 0.2);
    await sleep(SLEEPTIME_AFTER_MOVE);

    this.setMovements('default');
  }
}
