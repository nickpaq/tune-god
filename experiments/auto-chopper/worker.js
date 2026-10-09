// Classic worker: upstream Music Tempo's browser bundle exposes MusicTempo on self.
self.onmessage = ({data}) => {
  const {id, method, mono, rate, beatsPerBar, assisted, startSeconds} = data;
  try {
    let result;
    if (method === 'original' || method === 'corrected') {
      const raw = (method === 'original' ? original : corrected)(mono, rate, beatsPerBar);
      if (!raw) throw new Error('No stable beat grid found.');
      const origin = assisted ? 0 : raw.downbeatSeconds;
      const fix = correctDrift(mono, {sampleRate:rate,beatsPerBar,segments:[{line:0,frame:origin*rate,beatFrames:60*rate/raw.bpm}],offsets:{},downbeats:[0]});
      result = {bpm:60*rate/fix.grid.segments[0].beatFrames,origin:origin+startSeconds,rawBpm:raw.bpm,confidence:raw.confidence,segments:fix.grid.segments.map(s=>({line:s.line,time:s.frame/rate+startSeconds,period:s.beatFrames/rate})),matches:fix.matches,relocks:fix.relocks,originKind:assisted?'User downbeat':'Estimated bar 1'};
    } else if (method === 'music') {
      const detected = new self.MusicTempo(mono);
      const bpm = Number(detected.tempo);
      result = {bpm,origin:assisted?startSeconds:detected.beats[0]+startSeconds,beats:detected.beats.map(t=>t+startSeconds),originKind:assisted?'User downbeat':'First tracked beat (bar 1 unknown)'};
    } else {
      const detected = guess(mono,rate); // Upstream defaults, including its 90–180 BPM range.
      result = {bpm:detected.bpm,unroundedBpm:detected.tempo,origin:assisted?startSeconds:detected.offset+startSeconds,originKind:assisted?'User downbeat':'Beat offset (bar 1 unknown)'};
    }
    if (!Number.isFinite(result.bpm) || result.bpm<=0 || !Number.isFinite(result.origin)) throw new Error('No usable tempo or beat origin.');
    self.postMessage({id,result});
  } catch (error) { self.postMessage({id,error:error?.message || String(error)}); }
};
