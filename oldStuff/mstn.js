function logger(name) {
  return (...args) => {
    console.log(`LOG: ${name}: `, args);
  }
}

let spawnCount = 0;

async function inServerSpawns() {
  console.log({spawnCount});

  // Выводим текущий инвентарь
  logger('inventory')(kbot.bot.inventory.slots.filter(i => i !== null).map(i => i.displayName));

  if (spawnCount === 0) {
    spawnCount += 1;
    return;
  }

  if (spawnCount === 1) {
    spawnCount += 1;

    await kbot.sleep(3000);
    kbot.bot.chat(`/l ${process.env.IN_SERVER_PASSWORD}`);
    await kbot.sleep(1000);

    return;
  }

  if (spawnCount === 2) {
    spawnCount += 1;

    const selectModeSlot = kbot.bot.inventory.slots.find(item => item === null ? false : item.displayName === 'Compass');
    if (selectModeSlot) {
      // Ещё один костыль, ищет менюшку серверов и кликает на сервер выживания
      kbot.bot.once('windowOpen', async (window) => {
        await kbot.sleep(100);
        const survivalModeSlot = window.slots
          .filter(i => i !== null)
          .find(i => i.displayName === 'Diamond Sword');

        if (survivalModeSlot) {
          await kbot.sleep(100);
          kbot.bot.clickWindow(survivalModeSlot.slot, 0, 0);
          logger('slot')(survivalModeSlot)
        }
      });

      // Костыльная вещь чтобы "кликнуть" по компасу и открыть серверное меню
      await kbot.sleep(100);
      const position = kbot.bot.entity.position.offset(0, -1, 0);
      const refBlock = kbot.bot.blockAt(position);
      kbot.bot.dig(refBlock, () => {
      });
      await kbot.sleep(100);
      kbot.bot.stopDigging();
    }

    return;
  }

  spawnCount += 1;
  return;
}