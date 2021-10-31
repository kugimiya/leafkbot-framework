require('dotenv').config();
const { KBot, KBotManager } = require('./lib');

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


kbot.addCommand('build.scaffold', async (self) => {
  let currentPosition = self.bot.entity.position;

  for await (let dir of Object.values(directions)) {
    const [offsetX, offsetZ] = dir;

    for (let i = 0; i <= 19; i += 1) {
      await self.bot.placeBlock(
        self.bot.blockAt(
          currentPosition.offset(0, -1, 0),
        ),
        new self.Vec3(offsetX, 0, offsetZ),
        () => {}
      );

      await self.bot.placeBlock(
        self.bot.blockAt(
          currentPosition.offset(offsetX, 0, offsetZ)
        ),
        new self.Vec3(0, 1, 0),
        () => {}
      );
      
      const { x, y, z } = currentPosition.offset(offsetX, 1, offsetZ);
      await self.moveTo(x, y, z);

      currentPosition = currentPosition.offset(offsetX, 1, offsetZ);
    }
  }
});

async function switchBlock(blockId) {
  const blk = await kbot.bot.inventory.findInventoryItem(blockId, null);
  await kbot.bot.equip(blk, 'hand', () => {});
}

async function buildFundament(blockId, startVertex, endVertex) {
  for (let x = startVertex.x; x >= endVertex.x; x -= 2) {
    for (let z = startVertex.z; z <= endVertex.z; z += 2) {
      kbot.addTask(async (self) => {
        await switchBlock(blockId);

        const placementBlock = self.bot.blockAt(new self.Vec3(x, startVertex.y, z));
        if (placementBlock.displayName !== 'Air') {
          return;
        }

        const refBlock = self.bot.blockAt(new self.Vec3(x, startVertex.y - 1, z));
        await self.gotoBlock(refBlock);
        await self.bot.placeBlock(refBlock, new self.Vec3(0, 1, 0));
      });
    }
  }
}

kbot.addCommand('build.plato', async (self) => {
  await switchBlock(1);

  let startPosition = new self.Vec3(86, 4, 346);
  let spiralCenter = startPosition.offset(-10, 0, 10);

  const buildAtX = async (x1, x2, startPos) => {
    let pos = startPos;

    if (x1 > x2) {
      for (let x = x1; x > x2; x -= 1) {
        await self.bot.placeBlock(
          self.bot.blockAt(pos.offset(0, -1, 0)),
          new self.Vec3(-1, 0, 0),
          () => {}
        );

        pos = pos.offset(-1, 0, 0);

        await self.moveTo(pos.x, pos.y, pos.z);
      }
    } else {
      for (let x = x2; x > x1; x -= 1) {
        await self.bot.placeBlock(
          self.bot.blockAt(pos.offset(0, -1, 0)),
          new self.Vec3(1, 0, 0),
          () => {}
        );

        pos = pos.offset(1, 0, 0);

        await self.moveTo(pos.x, pos.y, pos.z);
      }
    }

    return pos;
  }

  const buildAtZ = async (z1, z2, startPos) => {
    let pos = startPos;

    if (z1 > z2) {
      for (let x = z1; x > z2; x -= 1) {
        await self.bot.placeBlock(
          self.bot.blockAt(pos.offset(0, -1, 0)),
          new self.Vec3(0, 0, -1),
          () => {}
        );

        pos = pos.offset(0, 0, -1);

        await self.moveTo(pos.x, pos.y, pos.z);
      }
    } else {
      for (let x = z2; x > z1; x -= 1) {
        await self.bot.placeBlock(
          self.bot.blockAt(pos.offset(0, -1, 0)),
          new self.Vec3(0, 0, 1),
          () => {}
        );

        pos = pos.offset(0, 0, 1);

        await self.moveTo(pos.x, pos.y, pos.z);
      }
    }

    return pos;
  }

  // Нулевой шаг -- идём к центру будущей платформы
  // let nextPos = self.bot.entity.position;
  // nextPos = await buildAtX(startPosition.x, spiralCenter.x, nextPos);
  // nextPos = await buildAtZ(startPosition.z, spiralCenter.z, nextPos);

  await self.moveTo(spiralCenter.x, spiralCenter.y + 1, spiralCenter.z);

  // Первый шаг -- платформа
  await manager.processSpiralPath(
    spiralCenter.offset(0, 1, 0), 
    19,
    async (refBlock) => refBlock.displayName !== 'Air', 
    async (_self, refBlock) => {
      await _self.bot.placeBlock(refBlock, new _self.Vec3(0, 1, 0), () => {});
    },
    () => {},
  );

  // Второй шаг -- края платформы
  await manager.processBorder(
    [startPosition.offset(-1, 1, 1), startPosition.offset(-19, 1, 19)],
    async (refBlock) => refBlock.displayName !== 'Air',
    async (_self, refBlock) => {
      await _self.bot.placeBlock(refBlock, new _self.Vec3(0, 1, 0), () => {});
    }
  );

  // Третий шаг -- песочек
  await buildFundament(
    12,
    startPosition.offset(-3, 1, 3),
    startPosition.offset(-17, 1, 17)
  );

  // Четвертый шаг -- кактусы
  await buildFundament(
    81,
    startPosition.offset(-3, 2, 3),
    startPosition.offset(-17, 2, 17)
  );
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
