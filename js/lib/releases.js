// Release notes for the "What's new" pop-up. Add a NEW entry at the TOP when you ship something students should hear about.
// Rules: only announce what is really in the app. `at` is the day you ship it: students who joined after that day never see it
// (it is not new to them). An item with `show` appears only to the students it is relevant to; a release with no visible items is skipped.
//
// Template:
// { id: "2026-12-01", at: "2026-12-01", title: "What's new", items: [
//   { icon: "trophy", title: "Short headline", text: "One sentence in plain words.", show: (u) => true } ] }
//
// u = { level, paid, free, admin }  (free = free access is switched on for everyone)
export const RELEASES = [
  {
    id: "2026-11-21", at: "2026-11-20", title: "New: study library and more",
    items: [
      { icon: "book", title: "Study library", text: "Read notes, summaries and past papers as PDFs right inside the app. Find it on Home. Subscribers read everything and some documents are free for all. Save a document on your phone to read it without data.", show: () => true },
      { icon: "trophy", title: "Bigger leaderboard", text: "The leaderboard now shows the top 300 students, 50 at a time.", show: (u) => u.paid || u.free || u.admin },
      { icon: "sparkle", title: "Affiliates earn free days", text: "Affiliates now get free app access for every friend who joins with their link, and extra days when a friend subscribes.", show: () => true },
      { icon: "shield", title: "Daily analysis, emails and revenue (admin)", text: "Analysis now runs by itself once a day when you open the app. Turn on the thank-you email in Settings, and see income and costs in the new Revenue tab.", show: (u) => u.admin },
    ],
  },
  {
    id: "2026-11-10", at: "2026-11-09", title: "New: earn with the app",
    items: [
      { icon: "trophy", title: "Affiliate program", text: "Have 50+ followers on social media? Apply in Profile > Affiliate program, share your personal link and earn 10% when your friends subscribe. Add 10 people for a free week, and a free month if 7 of them subscribe.", show: () => true },
      { icon: "sparkle", title: "Every player in the results", text: "Tournament results and the Hall of Fame now show everyone who took part, not just the top spots.", show: () => true },
    ],
  },
  {
    id: "2026-11-09", at: "2026-11-09", title: "What's new in SUMAS Quiz Arena",
    items: [
      { icon: "book", title: "Pick your level", text: "Choose 100, 200 or 300 level and see only the question banks for you. 200 and 300 level open up as soon as their banks are added.", show: () => true },
      { icon: "sparkle", title: "Free access is instant", text: "Everything is open to every student right now, and it switches on without you having to close and reopen the app.", show: (u) => u.free },
      { icon: "arrow", title: "Updates reach everyone", text: "When an important update is needed, you will see a notice with the date. Tap Update now and you are on the newest version.", show: () => true },
      { icon: "shield", title: "Required updates (admin)", text: "In Admin > Settings you can now require a build by a date. Publish the new files first, then set it.", show: (u) => u.admin },
    ],
  },
];
