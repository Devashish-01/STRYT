// A friendly, non-identifying public handle (e.g. "SunnyResident4821"). Used as
// the default privacy alias so a user's real name (users.name) is never shown
// publicly until a request is accepted. Users can edit it in their profile.
const ADJ = ["Sunny", "Happy", "Swift", "Kind", "Calm", "Cosy", "Bright", "Lucky", "Mellow", "Brave", "Chill", "Jolly"];
const NOUN = ["Resident", "Neighbor", "Local", "Friend", "Buddy", "Native", "Dweller", "Regular"];

export function generateAlias(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}${n}${Math.floor(1000 + Math.random() * 9000)}`;
}
