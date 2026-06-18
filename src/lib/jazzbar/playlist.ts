// Live Jazz Radio Streams
export interface Track {
  id: string;
  url: string;
  title: string;
  artist: string;
}

export const TRACKS: Track[] = [
  {
    id: "jazz-king",
    url: "https://jking.cdnstream1.com/b22139_128mp3",
    title: "Jazz King",
    artist: "Live Radio",
  },
  {
    id: "swiss-jazz",
    url: "https://livestreaming-node-4.srg-ssr.ch/srgssr/rsj/mp3/128",
    title: "Radio Swiss Jazz",
    artist: "Live Radio",
  },
  {
    id: "knkx",
    url: "https://knkx-live-a.edge.audiocdn.com/6285_256k",
    title: "KNKX Jazz",
    artist: "Live Radio",
  },
  {
    id: "relaxing-jazz",
    url: "http://stream-02-eu.relaxingjazz.com/stream/3/",
    title: "Relaxing Jazz EU",
    artist: "Live Radio",
  },
];
