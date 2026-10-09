declare module "music-tempo" {
  export default class MusicTempo {
    constructor(audio: Float32Array);
    tempo: string;
    beats: number[];
  }
}
