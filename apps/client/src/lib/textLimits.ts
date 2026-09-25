// Length caps for player-written text, mirrored from the server's
// apps/server/src/lib/textLimits.ts (audit M11). The server's copy is the one
// that counts; these only stop typing at the limit so a long post is not
// written in full and then refused. Change both together.
export const TEXT_LIMITS = {
    forumTitle: 200,
    forumPost: 10_000,
    pollQuestion: 300,
    pollOption: 200,
    pollOptionsMax: 6,

    guildForumTitle: 200,
    guildForumPost: 10_000,

    messageSubject: 200,
    messageBody: 5_000,

    guildName: 100,
    guildDescription: 500,
    guildRecruitment: 500,
    guildApplication: 500,
} as const
