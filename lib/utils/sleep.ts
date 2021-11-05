type SleepType = (ms: number) => Promise<void>;
const sleep: SleepType = (ms) => {
  return new Promise(
    (res) => setTimeout(() => res(), ms)
  );
}

export default sleep;
