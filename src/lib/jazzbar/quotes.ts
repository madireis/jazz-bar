export const QUOTES: { text: string; author: string }[] = [
  { text: "Life is like jazz... it's best when you improvise.", author: "George Gershwin" },
  { text: "Don't play what's there, play what's not there.", author: "Miles Davis" },
  { text: "If you have to ask what jazz is, you'll never know.", author: "Louis Armstrong" },
  {
    text: "The most important thing I look for in a musician is whether he knows how to listen.",
    author: "Duke Ellington",
  },
  { text: "Music is the silence between the notes.", author: "Claude Debussy" },
  { text: "Without music, life would be a mistake.", author: "Friedrich Nietzsche" },
  {
    text: "There are no wrong notes in jazz, only notes in the wrong places.",
    author: "Miles Davis",
  },
  { text: "Jazz is not just music, it's a way of life.", author: "Nina Simone" },
  {
    text: "Be patient with yourself. Self-growth is tender; it's holy ground.",
    author: "Stephen Covey",
  },
  { text: "The quieter you become, the more you can hear.", author: "Ram Dass" },
  {
    text: "Almost everything will work again if you unplug it for a few minutes, including you.",
    author: "Anne Lamott",
  },
  { text: "What you seek is seeking you.", author: "Rumi" },
  { text: "Tend to the garden you can touch.", author: "Unknown" },
  { text: "The mountain remains unmoved at its seeming defeat by the mist.", author: "Tagore" },
  {
    text: "Do not go where the path may lead, go instead where there is no path.",
    author: "Emerson",
  },
  { text: "Smile, breathe, and go slowly.", author: "Thich Nhat Hanh" },
  {
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Aristotle",
  },
  {
    text: "Slow down and enjoy life. It's not only the scenery you miss by going too fast.",
    author: "Eddie Cantor",
  },
  { text: "In stillness lies wisdom.", author: "Zen Proverb" },
  {
    text: "The only Zen you find on the tops of mountains is the Zen you bring up there.",
    author: "Robert M. Pirsig",
  },
  { text: "Patience is bitter, but its fruit is sweet.", author: "Aristotle" },
  { text: "Time you enjoy wasting is not wasted time.", author: "Marthe Troly-Curtin" },
  {
    text: "Music expresses that which cannot be put into words and that which cannot remain silent.",
    author: "Victor Hugo",
  },
  { text: "Concentration is the secret of strength.", author: "Emerson" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Do less, but better.", author: "Dieter Rams" },
  { text: "Where you are right now is exactly where you need to be.", author: "Lao Tzu" },
  {
    text: "Solitude is where I place my chaos to rest and awaken my inner peace.",
    author: "Nikki Rowe",
  },
  {
    text: "He who is not contented with what he has, would not be contented with what he would like to have.",
    author: "Socrates",
  },
  { text: "A jug fills drop by drop.", author: "Buddha" },
  { text: "Wherever you are, be all there.", author: "Jim Elliot" },
  { text: "If you light a lamp for somebody, it will also brighten your path.", author: "Buddha" },
  { text: "Each note, like each hour, will not come again.", author: "Unknown" },
  { text: "Cold whiskey, warm fire, sharp pencil.", author: "Anonymous" },
  { text: "The bar is open. The clock is yours.", author: "Jazz Bar" },
  { text: "Play the silence too.", author: "Thelonious Monk (paraphrased)" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  {
    text: "Sometimes you have to play a long time to be able to play like yourself.",
    author: "Miles Davis",
  },
  { text: "I never play anything the same way twice.", author: "Louis Armstrong" },
  { text: "Music is the strongest form of magic.", author: "Marilyn Manson" },
  { text: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exupéry" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Begin again. And again. And again.", author: "Unknown" },
  { text: "All great work is preparation for dying.", author: "Yeats" },
  { text: "Sit. Feast on your life.", author: "Derek Walcott" },
  { text: "Rest when weary. Refresh and renew yourself.", author: "Ralph Marston" },
  {
    text: "An artist is never ahead of his time but most people are far behind theirs.",
    author: "Edgard Varèse",
  },
  { text: "Music gives a soul to the universe.", author: "Plato" },
  {
    text: "After silence, that which comes nearest to expressing the inexpressible is music.",
    author: "Aldous Huxley",
  },
  { text: "Doing nothing is better than being busy doing nothing.", author: "Lao Tzu" },
  { text: "When the music changes, so does the dance.", author: "African Proverb" },
  {
    text: "The future belongs to those who believe in the beauty of their dreams.",
    author: "Eleanor Roosevelt",
  },
  { text: "It is never too late to be what you might have been.", author: "George Eliot" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Sometimes the most productive thing you can do is rest.", author: "Mark Black" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Every artist was first an amateur.", author: "Emerson" },
  { text: "The cave you fear to enter holds the treasure you seek.", author: "Joseph Campbell" },
];

export function randomQuote(prevText?: string) {
  let q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  let guard = 0;
  while (q.text === prevText && guard++ < 5) {
    q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
  return q;
}
