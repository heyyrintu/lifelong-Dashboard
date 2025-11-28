import { XCard } from "@/components/ui/x-gradient-card"

const XCardDummyData = {
    link: "https://x.com/dorian_baffier/status/1880291036410572934",
    authorName: "Dorian",
    authorHandle: "dorian_baffier",
    authorImage: "https://pbs.twimg.com/profile_images/1854916060807675904/KtBJsyWr_400x400.jpg",
    content: [
        "All components from KokonutUI can now be open in @v0 🎉",
        "1. Click on 'Open in V0'",
        "2. Customize with prompts",
        "3. Deploy to your app",
    ],
    isVerified: true,
    timestamp: "Jan 18, 2025",
    reply: {
        authorName: "shadcn",
        authorHandle: "shadcn",
        authorImage:
            "https://pbs.twimg.com/profile_images/1593304942210478080/TUYae5z7_400x400.jpg",
        content: "Awesome.",
        isVerified: true,
        timestamp: "Jan 18",
    },
};


function XCardDemoDefault() {
    return <XCard {...XCardDummyData} />
}

const XCardDummyDataTwo = {
    link: "https://x.com/serafimcloud/status/1876950000000000000",
    authorName: "serafim",
    authorHandle: "serafimcloud",
    authorImage: "https://pbs.twimg.com/profile_images/1763123612905558017/fY93bvRq_400x400.jpg",
    content: [
        "I spent 70 days full-time curating the ultimate library of @shadcn/ui-like components.",
        "And today, I'm launching it publicly.",
        "Here's what it is:",
        "• 730+ production-ready components from 50+ top design engineers",
        "• Each component is yours to own - just like shadcn/ui",
        "• Install everything with shadcn CLI: code, dependencies, hooks, global css and tailwind config extensions",
        "It's also optimized for AI code editors like @lovable_dev, @stackblitz's bolt. new, and @vercel's @v0, with tailored prompts for effortless integration.",
        "👉 http://21st.dev is live now. Build faster, own your code, and never struggle with UI setup again."
    ],
    isVerified: true,
    timestamp: "Apr 6",
    reply: {
        authorName: "shadcn",
        authorHandle: "shadcn",
        authorImage: "https://pbs.twimg.com/profile_images/1593304942210478080/TUYae5z7_400x400.jpg",
        content: "Great work. CLI support is a nice touch.",
        isVerified: true,
        timestamp: "Jan 9"
    }
};

function XCardDemoTwo() {
    return <XCard {...XCardDummyDataTwo} />
}

export { XCardDemoDefault, XCardDemoTwo }
