// Seats and characters for any number of bots.
//
// office.config.json lists `seats` (desk spots drawn on the background) and `agents`.
// An agent may leave out `animal` and `seat`: it gets the next free character and the next
// free seat. When the building is full, the next agents go to building 2 ("2관"), which reuses
// the same seats, and so on.

const fs = require("node:fs");
const path = require("node:path");

const SPRITES = path.join(__dirname, "..", "public", "assets", "sprites");

// Order = the order new bots receive characters.
const ROSTER = [
  "hamster", "shiba", "penguin", "otter", "cat",
  "capybara", "redpanda", "rabbit", "fox", "bear", "raccoon", "frog", "koala",
];

function availableAnimals() {
  return ROSTER.filter((n) => fs.existsSync(path.join(SPRITES, `${n}.png`)));
}

function layoutAgents(config) {
  const seats = config.seats || [];
  const animals = availableAnimals();
  const used = new Set(config.agents.map((a) => a.animal).filter(Boolean));
  let next = 0;
  config.agents.forEach((a, i) => {
    if (!a.animal) {
      const free = animals.find((n) => !used.has(n));
      a.animal = free || animals[i % animals.length];
      used.add(a.animal);
    }
    if (!a.seat && seats.length) {
      const s = seats[next % seats.length];
      a.page = Math.floor(next / seats.length) + 1;
      a.seat = { x: s.x, y: s.y };
      if (s.desk) a.desk = { ...s.desk, y: s.y };
      if (s.frontCrop) a.frontCrop = s.frontCrop;
      next++;
    }
    a.page ||= 1;
  });
  config.pages = Math.max(1, ...config.agents.map((a) => a.page));
  config.roster = animals;
  return config;
}

module.exports = { ROSTER, availableAnimals, layoutAgents };
