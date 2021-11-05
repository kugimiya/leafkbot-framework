import { IndexedData } from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Movements } from 'mineflayer-pathfinder';

const makePedantikMovement = (bot: Bot, data: IndexedData): Movements => {
  const movements = new Movements(bot, data);
  movements.canDig = false;
  movements.allow1by1towers = false;
  movements.allowFreeMotion = false;
  movements.allowParkour = false;
  movements.allowSprinting = false;

  return movements;
}

export default makePedantikMovement;
