require('dotenv').config();
const { KBot, KBotManager } = require('./lib');

console.clear();

const kbot = new KBot({
  username: process.env.BOT_USERNAME,
  password: process.env.BOT_PASSWORD,
  host: process.env.BOT_TARGET_HOST,
  port: process.env.BOT_TARGET_PORT,
  version: '1.12.2',
});

const manager = new KBotManager(kbot);

kbot.bot.on('spawn', () => {
  kbot.bot.waitForChunksToLoad();
});

const directions = {
  south: [0,  1],
  west:  [-1, 0],
  north: [0, -1],
  east:  [1,  0],
};

let workingArea = [];
let chestsCoordinates = [];

kbot.addCommand('scan.area', async (self) => {
  const raycast = (direction, start) => {
    let position = start.offset(0, 0, 0);
    let collisionDetected = false;

    while (!collisionDetected) {
      position = position.offset(direction[0], 0, direction[1]);
      const refBlock = self.bot.blockAt(position);

      if (refBlock.displayName !== 'Air') {
        collisionDetected = true;
      }
    }

    return position;
  }

  const startPosition = self.bot.entity.position;

  const [
    southCollision,
    westCollision,
    northCollision,
    eastCollision,
  ] = [
    raycast(directions.south, startPosition),
    raycast(directions.west, startPosition),
    raycast(directions.north, startPosition),
    raycast(directions.east, startPosition),
  ];

  workingArea = [
    new self.Vec3(eastCollision.x, startPosition.y, southCollision.z),
    new self.Vec3(eastCollision.x, startPosition.y, northCollision.z),
    new self.Vec3(westCollision.x, startPosition.y, northCollision.z),
    new self.Vec3(westCollision.x, startPosition.y, southCollision.z),
  ];
});


kbot.addCommand('scan.chests', async (self) => {
  const shouldSkip = [];
  const initialPosition = workingArea[0].offset(0, 0, 0);
  const checkSkip = (x, z) => (position) => (
    Math.floor(position.x) === Math.floor(x) 
    && Math.floor(position.z) === Math.floor(z)
  );

  for (let z = workingArea[0].z; z >= workingArea[1].z; z -= 1) {
    for (let x = workingArea[0].x; x >= workingArea[3].x; x -= 1) {
      const refBlockPos = new self.Vec3(x, initialPosition.y, z);
      const refBlock = self.bot.blockAt(refBlockPos);

      // Иногда может быть null
      if (!refBlock) {
        continue;
      }

      // Пропускаем всё, что не сундук
      if (refBlock.displayName !== 'Chest') {
        continue;
      }

      // Пропускаем тот сундук, что нужно пропустить, т.к. он двойной
      if (shouldSkip.some(checkSkip(x, z))) {
        continue;
      }

      // Сканим область на предмет 2го сундука
      for (let dirKey in directions) {
        const dir = directions[dirKey];
        const chestSibling = self.bot.blockAt(refBlockPos.offset(dir[0], 0, dir[1]));

        if (chestSibling && chestSibling.displayName === 'Chest') {
          shouldSkip.push(refBlockPos.offset(dir[0], 0, dir[1]));
        }
      }

      chestsCoordinates.push(refBlockPos);
    }
  }

  console.log(chestsCoordinates);
});

kbot.addCommand('test', async bot => {
  const width = 20;

  await manager.processScaffoldPath(
    bot.bot.entity.position, 
    width,
    // Платформа!!!
    async (iteration, spiralCenter, self, currentPosition) => {
      let tasks = [];
      
      // Нулевой шаг -- идём к центру будущей платформы
      tasks.push(async _self => {
        await _self.moveTo(spiralCenter.x, spiralCenter.y + iteration, spiralCenter.z);
      });

      // Первый шаг -- платформа
      tasks = [
        ...tasks,
        ...(await manager.processSpiralPath(
          spiralCenter.offset(0, iteration, 0), 
          width - 1,
          async (refBlock) => refBlock.displayName !== 'Air', 
          async (self, refBlock) => {
            await self.switchBlock(self.mcData.blocksByName['stone'].id);
            await self.bot.placeBlock(refBlock, new self.Vec3(0, 1, 0), () => {});
          },
          () => {},
        ))
      ];

      // Второй шаг -- края платформы
      tasks = [
        ...tasks,
        ...(await manager.processBorderPath(
          [currentPosition.offset(-1, 0, 1), currentPosition.offset(-1 * (width - 1), 0, (width - 1))],
          async (refBlock) => refBlock.displayName !== 'Air',
          async (self, refBlock) => {
            await self.switchBlock(self.mcData.blocksByName['stone'].id);
            await self.bot.placeBlock(refBlock, new self.Vec3(0, 1, 0), () => {});
          }
        ))
      ];

      // Третий шаг -- песочек
      tasks = [
        ...tasks,
        ...(await manager.processFundamentPath(
          [currentPosition.offset(-3, 0, 3), currentPosition.offset(-1 * (width - 3), 0, width - 3)], 
          self.mcData.blocksByName['sand'].id, 
          async (self, refBlock) => await self.bot.placeBlock(refBlock, new self.Vec3(0, 1, 0), () => {})
        ))
      ];

      // Четвертый шаг -- кактусы
      tasks = [
        ...tasks,
        ...(await manager.processFundamentPath(
          [currentPosition.offset(-3, 0, 3), currentPosition.offset(-1 * (width - 3), 0, width - 3)], 
          self.mcData.blocksByName['cactus'].id, 
          async (self, refBlock) => await self.bot.placeBlock(refBlock, new self.Vec3(0, 1, 0), () => {})
        ))
      ];

      // Пятый шаг -- заборчики
      tasks = [
        ...tasks,
        ...(await manager.processFencesPath(
          [currentPosition.offset(-4, 2, 3), currentPosition.offset(-1 * (width - 3), 2, width - 3)],
          self.mcData.blocksByName['fence'].id,
          async (self, refBlock) => await self.bot.placeBlock(refBlock, new self.Vec3(0, 0, 1), () => {})
        ))
      ];

      return tasks;
    } 
  );
})

kbot.addCommand('kbot.come', async (self, username, message) => {
  const { x, y, z } = self.bot.players[username].entity.position;
  await self.moveTo(x, y, z);
});

kbot.addCommand('kbot.clear', async (self) => {
  const height = 48;
  const width = 24;
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
