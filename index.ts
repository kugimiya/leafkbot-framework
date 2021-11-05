require('dotenv').config();

import { Vec3 } from "vec3";
import KBot from "./lib/bot";
import { SpiralProcessor } from "./lib/processors";
import KBotScheduler from "./lib/scheduler";

console.clear();

const kbot = new KBot({
  username: String(process.env.BOT_USERNAME),
  password: process.env.BOT_PASSWORD,
  host: process.env.BOT_TARGET_HOST,
  port: Number(process.env.BOT_TARGET_PORT),
  version: '1.12.2',
});
const scheduler = new KBotScheduler(kbot);

try {
  kbot.initPathfinder();
  kbot.initWebViewer(Number(process.env.WEBVIEW_PORT));
} catch {
  console.error('ERROR: Bot was not initialized fully');
}

scheduler.addCommand('goto_zero', async (self, username) => {
  const { x, y, z } = self.bot.players[username].entity.position;
  await self.runPathfinder(new Vec3(x, y, z));
});

scheduler.addCommand('clear_level', async (self) => {
  const width = 24;

  await scheduler.runProcessor(SpiralProcessor, (proc) => {
    return proc.processPath(
      self.position,
      width,
      async refBlock => refBlock?.position === null ? false : !self.blockIs('air', refBlock?.position),
      async (self, refBlock) => {
        if (refBlock) {
          await self.bot.placeBlock(refBlock, new Vec3(0, 1, 0), () => {});
        }
      },
      async () => {},
    );
  })
});
