require('dotenv').config();
const { KBot, KBotManager } = require('./lib');

const kbot = new KBot({
  username: process.env.BOT_USERNAME,
  password: process.env.BOT_PASSWORD,
  host: process.env.BOT_TARGET_HOST,
  port: process.env.BOT_TARGET_PORT,
});

const manager = new KBotManager(kbot);

kbot.bot.on('spawn', () => {
  kbot.bot.chat('/login qwertyuiop');
  kbot.bot.waitForChunksToLoad();
});

kbot.addCommand('kbot.come', async (self, username, message) => {
  const { x, y, z } = self.bot.players[username].entity.position;
  await self.moveTo(x, y, z);
});

kbot.addCommand('kbot.borderRegion', async (self) => {
  let position = self.bot.entity.position;
  let width = 4;
  
  for (let i = 1; i <= width; i++) {
    await manager.pushTasks(manager.borderTasksGen(i, position));
  }
});

kbot.addCommand('kbot.clearRegion', async (self) => {
  const position = self.bot.entity.position;
  await manager.pushTasks(manager.clearTasksGen(16, 32, position));
});

kbot.addCommand('kbot.clear', async (self) => {
  const voidSize = 16;
  const voidHeight = 64;

  const runner = async (position) => {
    const retFunc = async (__pos) => {
      await self.addTask(async (_self) => {
        await _self.sleep(500);
        await _self.moveTo(__pos.x, __pos.y, __pos.z);
        await _self.sleep(500);
      });
    }

    // First level plain
    for (let i = 1; i <= voidSize; i++) {
      await manager.pushTasks(manager.borderTasksGen(i, position));
    }

    await retFunc(position);

    // First level border
    await manager.pushTasks(
      manager.borderTasksGen(
        voidSize + 2, 
        position.offset(-1, 0, -1),
        { stayOnBlocks: true },
      ),
    );

    await retFunc(position);

    // And the second one :^)
    for (let i = 1; i <= voidSize; i++) {
      await manager.pushTasks(manager.borderTasksGen(i, position, { heightOffset: -1 }));
    }

    await retFunc(position);

    // Second level border
    await manager.pushTasks(
      manager.borderTasksGen(
        voidSize + 2, 
        position.offset(-1, 0, -1),
        {
          heightOffset: -1,
          stayOnBlocks: true
        },
      ),
    );

    await retFunc(position);

    await manager.pushTasks(manager.clearTasksGen(voidSize, 1, position.offset(0, 0, 0)));

    await retFunc(position);
  }

  let _position = self.bot.entity.position;
  for (let level = 0; level <= voidHeight; level++) {
    if (level > 0) {
      _position = _position.offset(0, -1, 0);
    }

    await runner(_position);
  }
});
