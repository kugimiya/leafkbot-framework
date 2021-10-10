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
  kbot.bot.waitForChunksToLoad();
});

kbot.addCommand('kbot.come', async (self, username, message) => {
  const { x, y, z } = self.bot.players[username].entity.position;
  await self.moveTo(x, y, z);
});

kbot.addCommand('kbot.clear', async (self) => {
  const height = 72;
  const width = 17 * 8;
  const widthClear = width - 2;
  let startPosition = self.bot.entity.position;

  for (let i = 0; i < height; i++) {
    // First level (at i > 0 this will be skipped by spiral-process algorithm)
    await manager.processSpiralPath(
      startPosition, 
      width, 
      async (refBlock) => refBlock.displayName !== 'Air', 
      async (_self, refBlock) => {
        await _self.bot.placeBlock(refBlock, new _self.Vec3(0, 1, 0), () => {});
      },
      () => {},
    );
    
    // Second level (should protect bot from fluids and voids in clear step)
    await manager.processSpiralPath(
      startPosition.offset(0, -1, 0), 
      width,
      async (refBlock) => refBlock.displayName !== 'Air', 
      async (_self, refBlock) => {
        await _self.bot.placeBlock(refBlock, new _self.Vec3(0, 1, 0), () => {});
      },
      () => {},
    );
    
    // Clear step
    await manager.processSpiralPath(
      startPosition, 
      widthClear,
      async (refBlock) => refBlock.displayName === 'Air', 
      async (_self, refBlock) => {
        await _self.bot.dig(refBlock, true);
      },
      async (_self, refBlock) => {
        await _self.bot.dig(refBlock, true);
      },
    );
    
    // Delete 'center-block'
    startPosition = startPosition.offset(0, -1, 0);
  }
});
