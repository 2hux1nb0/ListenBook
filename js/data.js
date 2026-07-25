// ===== ListenBook Podcast Data =====
// 模拟播客数据，包含各类别、难度级别的播客节目

var PODCAST_DATA = [
  // ===== 新闻时事 =====
  {
    id: 1,
    title: "BBC News Daily",
    author: "BBC News",
    category: "news",
    categoryLabel: "新闻时事",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/bbc/200/200",
    description: "每日新闻播报，涵盖全球重要事件，用清晰标准的英语播报，适合高级学习者。",
    episodes: [
      { id: 101, title: "Global Economy Update - January 2024", duration: "18:32", date: "2024-01-15" },
      { id: 102, title: "Climate Summit: Key Takeaways", duration: "15:45", date: "2024-01-14" },
      { id: 103, title: "Tech Industry Layoffs Continue", duration: "12:20", date: "2024-01-13" },
      { id: 104, title: "International Relations Update", duration: "16:55", date: "2024-01-12" },
      { id: 105, title: "Healthcare Reform Debates", duration: "14:10", date: "2024-01-11" }
    ]
  },
  {
    id: 2,
    title: "NPR News Now",
    author: "NPR",
    category: "news",
    categoryLabel: "新闻时事",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/npr/200/200",
    description: "美国国家公共电台的新闻播报，语速适中，用词清晰，适合中级学习者。",
    episodes: [
      { id: 201, title: "Breaking: Major Policy Changes Announced", duration: "10:15", date: "2024-01-15" },
      { id: 202, title: "Community Stories: Local Heroes", duration: "8:30", date: "2024-01-14" },
      { id: 203, title: "Science Report: New Discoveries", duration: "11:45", date: "2024-01-13" },
      { id: 204, title: "Economic Outlook for 2024", duration: "13:20", date: "2024-01-12" }
    ]
  },
  {
    id: 3,
    title: "CNN 10",
    author: "CNN",
    category: "news",
    categoryLabel: "新闻时事",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/cnn10/200/200",
    description: "专为学生设计的10分钟新闻播报，语速较慢，适合初级学习者。",
    episodes: [
      { id: 301, title: "Today's Top Stories", duration: "10:00", date: "2024-01-15" },
      { id: 302, title: "World News Roundup", duration: "10:00", date: "2024-01-14" },
      { id: 303, title: "Science and Technology", duration: "10:00", date: "2024-01-13" }
    ]
  },

  // ===== 科技 =====
  {
    id: 4,
    title: "Lex Fridman Podcast",
    author: "Lex Fridman",
    category: "tech",
    categoryLabel: "科技",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/lex/200/200",
    description: "深度访谈科技领袖和科学家，探讨人工智能、哲学、科学等话题。",
    episodes: [
      { id: 401, title: "Elon Musk: Mars, AI, and the Future", duration: "3:02:15", date: "2024-01-10" },
      { id: 402, title: "Sam Altman: OpenAI and AGI", duration: "2:45:30", date: "2024-01-05" },
      { id: 403, title: "Andrej Karpathy: Deep Learning", duration: "2:30:00", date: "2023-12-28" }
    ]
  },
  {
    id: 5,
    title: "TechCrunch Daily",
    author: "TechCrunch",
    category: "tech",
    categoryLabel: "科技",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/techcrunch/200/200",
    description: "每日科技新闻和创业公司动态，涵盖最新科技趋势。",
    episodes: [
      { id: 501, title: "Startup Funding Roundup", duration: "15:20", date: "2024-01-15" },
      { id: 502, title: "AI Tools for Productivity", duration: "12:45", date: "2024-01-14" },
      { id: 503, title: "Apple's Latest Announcements", duration: "18:30", date: "2024-01-13" }
    ]
  },
  {
    id: 6,
    title: "CodeNewbie",
    author: "Saron Yitbarek",
    category: "tech",
    categoryLabel: "科技",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/codenewbie/200/200",
    description: "面向编程初学者的播客，用简单易懂的语言讨论编程话题。",
    episodes: [
      { id: 601, title: "What is JavaScript?", duration: "25:00", date: "2024-01-10" },
      { id: 602, title: "Getting Started with Python", duration: "22:30", date: "2024-01-05" },
      { id: 603, title: "Web Development Basics", duration: "28:15", date: "2023-12-28" }
    ]
  },

  // ===== 商业 =====
  {
    id: 7,
    title: "How I Built This",
    author: "Guy Raz / NPR",
    category: "business",
    categoryLabel: "商业",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/howibuilt/200/200",
    description: "创业者分享他们的成功故事和创业历程，故事性强，适合中级学习者。",
    episodes: [
      { id: 701, title: "Airbnb: Brian Chesky", duration: "45:20", date: "2024-01-12" },
      { id: 702, title: "Spotify: Daniel Ek", duration: "42:15", date: "2024-01-05" },
      { id: 703, title: "Instagram: Kevin Systrom", duration: "38:45", date: "2023-12-28" }
    ]
  },
  {
    id: 8,
    title: "The Tim Ferriss Show",
    author: "Tim Ferriss",
    category: "business",
    categoryLabel: "商业",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/timferriss/200/200",
    description: "深度访谈世界顶级人物，探讨习惯、策略和生活技巧。",
    episodes: [
      { id: 801, title: "Morning Routines of Top Performers", duration: "1:15:30", date: "2024-01-10" },
      { id: 802, title: "Negotiation Tactics from FBI", duration: "55:20", date: "2024-01-03" }
    ]
  },
  {
    id: 9,
    title: "Business English Pod",
    author: "BEP",
    category: "business",
    categoryLabel: "商业",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/bep/200/200",
    description: "商务英语学习播客，教授工作中常用的英语表达和词汇。",
    episodes: [
      { id: 901, title: "Introduction to Business English", duration: "15:00", date: "2024-01-15" },
      { id: 902, title: "Email Writing Tips", duration: "12:30", date: "2024-01-10" },
      { id: 903, title: "Phone Call Etiquette", duration: "14:15", date: "2024-01-05" }
    ]
  },

  // ===== 教育 =====
  {
    id: 10,
    title: "TED Talks Daily",
    author: "TED",
    category: "education",
    categoryLabel: "教育",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/ted/200/200",
    description: "TED演讲合集，涵盖科技、娱乐、设计等多个领域，内容丰富。",
    episodes: [
      { id: 1001, title: "The Power of Vulnerability", duration: "20:15", date: "2024-01-15" },
      { id: 1002, title: "How Great Leaders Inspire Action", duration: "18:30", date: "2024-01-10" },
      { id: 1003, title: "The Puzzle of Motivation", duration: "22:00", date: "2024-01-05" }
    ]
  },
  {
    id: 11,
    title: "6 Minute English",
    author: "BBC Learning English",
    category: "education",
    categoryLabel: "教育",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/6min/200/200",
    description: "BBC出品的英语学习节目，每期6分钟，教授实用英语词汇和表达。",
    episodes: [
      { id: 1101, title: "Learning a Language", duration: "6:00", date: "2024-01-15" },
      { id: 1102, title: "Food and Health", duration: "6:00", date: "2024-01-08" },
      { id: 1103, title: "Technology Today", duration: "6:00", date: "2024-01-01" }
    ]
  },
  {
    id: 12,
    title: "The Education Podcast",
    author: "Various",
    category: "education",
    categoryLabel: "教育",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/edupod/200/200",
    description: "深度探讨教育理念和实践，适合对教育话题感兴趣的高级学习者。",
    episodes: [
      { id: 1201, title: "Future of Education", duration: "35:20", date: "2024-01-12" },
      { id: 1202, title: "Learning Science Insights", duration: "42:15", date: "2024-01-05" }
    ]
  },

  // ===== 健康 =====
  {
    id: 13,
    title: "The Huberman Lab",
    author: "Andrew Huberman",
    category: "health",
    categoryLabel: "健康",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/huberman/200/200",
    description: "斯坦福大学神经科学家讲解大脑和身体科学，内容深入但讲解清晰。",
    episodes: [
      { id: 1301, title: "Sleep Optimization Tools", duration: "1:45:00", date: "2024-01-10" },
      { id: 1302, title: "The Science of Focus", duration: "2:00:00", date: "2024-01-03" }
    ]
  },
  {
    id: 14,
    title: "Health Matters",
    author: "Healthline",
    category: "health",
    categoryLabel: "健康",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/health/200/200",
    description: "简单易懂的健康知识播客，教你如何保持健康生活方式。",
    episodes: [
      { id: 1401, title: "Healthy Eating Basics", duration: "15:00", date: "2024-01-15" },
      { id: 1402, title: "Exercise for Beginners", duration: "12:30", date: "2024-01-10" },
      { id: 1403, title: "Mental Health Tips", duration: "18:00", date: "2024-01-05" }
    ]
  },

  // ===== 社会 =====
  {
    id: 15,
    title: "This American Life",
    author: "Ira Glass",
    category: "society",
    categoryLabel: "社会",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/thisam/200/200",
    description: "讲述美国人生活故事的播客，故事性强，贴近日常生活。",
    episodes: [
      { id: 1501, title: "The Problem We All Live With", duration: "55:30", date: "2024-01-12" },
      { id: 1502, title: "Small World Stories", duration: "48:15", date: "2024-01-05" }
    ]
  },
  {
    id: 16,
    title: "Social Studies",
    author: "Various",
    category: "society",
    categoryLabel: "社会",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/social/200/200",
    description: "探讨社会现象和文化话题的播客，用简单的英语讨论复杂的社会议题。",
    episodes: [
      { id: 1601, title: "Understanding Social Media", duration: "20:00", date: "2024-01-15" },
      { id: 1602, title: "Community and Connection", duration: "18:30", date: "2024-01-08" }
    ]
  },

  // ===== 文化 =====
  {
    id: 17,
    title: "99% Invisible",
    author: "Roman Mars",
    category: "culture",
    categoryLabel: "文化",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/99pi/200/200",
    description: "探讨设计和建筑的播客，发现生活中隐藏的设计故事。",
    episodes: [
      { id: 1701, title: "The Power of Design", duration: "35:20", date: "2024-01-10" },
      { id: 1702, title: "Architecture Stories", duration: "40:15", date: "2024-01-03" }
    ]
  },
  {
    id: 18,
    title: "The Art History Podcast",
    author: "Various",
    category: "culture",
    categoryLabel: "文化",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/arthist/200/200",
    description: "深入探讨艺术历史的播客，适合对艺术文化感兴趣的学习者。",
    episodes: [
      { id: 1801, title: "Renaissance Art Explained", duration: "45:00", date: "2024-01-12" },
      { id: 1802, title: "Modern Art Movements", duration: "50:30", date: "2024-01-05" }
    ]
  },

  // ===== 科学 =====
  {
    id: 19,
    title: "Radiolab",
    author: "WNYC Studios",
    category: "science",
    categoryLabel: "科学",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/radiolab/200/200",
    description: "用创新的声音设计讲述科学故事，让复杂的科学概念变得有趣。",
    episodes: [
      { id: 1901, title: "The Universe in a Nutshell", duration: "55:30", date: "2024-01-10" },
      { id: 1902, title: "Sound and Perception", duration: "48:15", date: "2024-01-03" }
    ]
  },
  {
    id: 20,
    title: "StarTalk Radio",
    author: "Neil deGrasse Tyson",
    category: "science",
    categoryLabel: "科学",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/startalk/200/200",
    description: "天体物理学家Neil deGrasse Tyson主持的科学播客，讨论宇宙和科学。",
    episodes: [
      { id: 2001, title: "The Multiverse Theory", duration: "1:05:00", date: "2024-01-12" },
      { id: 2002, title: "Black Holes Explained", duration: "55:30", date: "2024-01-05" }
    ]
  },

  // ===== 体育 =====
  {
    id: 21,
    title: "The Bill Simmons Podcast",
    author: "Bill Simmons",
    category: "sports",
    categoryLabel: "体育",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/simmons/200/200",
    description: "美国体育播客，主要讨论NBA和NFL，语言风格轻松幽默。",
    episodes: [
      { id: 2101, title: "NBA Season Preview", duration: "1:20:00", date: "2024-01-10" },
      { id: 2102, title: "NFL Playoff Predictions", duration: "55:30", date: "2024-01-03" }
    ]
  },
  {
    id: 22,
    title: "Sports English",
    author: "Various",
    category: "sports",
    categoryLabel: "体育",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/sportseng/200/200",
    description: "通过体育话题学习英语，教授体育相关的词汇和表达。",
    episodes: [
      { id: 2201, title: "Football Vocabulary", duration: "15:00", date: "2024-01-15" },
      { id: 2202, title: "Basketball Terms", duration: "12:30", date: "2024-01-10" }
    ]
  },

  // ===== 娱乐 =====
  {
    id: 23,
    title: "Conan O'Brien Needs a Friend",
    author: "Conan O'Brien",
    category: "entertainment",
    categoryLabel: "娱乐",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/conan/200/200",
    description: "喜剧演员Conan的访谈节目，轻松幽默，对话自然。",
    episodes: [
      { id: 2301, title: "Will Ferrell Interview", duration: "1:05:00", date: "2024-01-10" },
      { id: 2302, title: "Jennifer Aniston Chat", duration: "55:30", date: "2024-01-03" }
    ]
  },
  {
    id: 24,
    title: "Movie Podcast Weekly",
    author: "Various",
    category: "entertainment",
    categoryLabel: "娱乐",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/moviepod/200/200",
    description: "电影评论和讨论播客，用简单的英语讨论热门电影。",
    episodes: [
      { id: 2401, title: "Best Movies of 2023", duration: "25:00", date: "2024-01-15" },
      { id: 2402, title: "Oscar Nominations Discussion", duration: "30:00", date: "2024-01-10" }
    ]
  },

  // ===== 故事 =====
  {
    id: 25,
    title: "The Moth",
    author: "The Moth",
    category: "story",
    categoryLabel: "故事",
    difficulty: "intermediate",
    cover: "https://picsum.photos/seed/moth/200/200",
    description: "真实故事讲述播客，人们分享自己的真实经历，故事感人。",
    episodes: [
      { id: 2501, title: "Stories of Courage", duration: "45:00", date: "2024-01-10" },
      { id: 2502, title: "Family Stories", duration: "40:30", date: "2024-01-03" }
    ]
  },
  {
    id: 26,
    title: "Short Story Podcast",
    author: "Various",
    category: "story",
    categoryLabel: "故事",
    difficulty: "beginner",
    cover: "https://picsum.photos/seed/shortstory/200/200",
    description: "短篇故事播客，每期讲述一个简短有趣的英语故事。",
    episodes: [
      { id: 2601, title: "The Magic Garden", duration: "8:00", date: "2024-01-15" },
      { id: 2602, title: "A Rainy Day Adventure", duration: "7:30", date: "2024-01-10" },
      { id: 2603, title: "The Lost Key", duration: "6:45", date: "2024-01-05" }
    ]
  },
  {
    id: 27,
    title: "Lore",
    author: "Aaron Mahnke",
    category: "story",
    categoryLabel: "故事",
    difficulty: "advanced",
    cover: "https://picsum.photos/seed/lore/200/200",
    description: "探索民间传说和恐怖故事的播客，叙事风格独特。",
    episodes: [
      { id: 2701, title: "The Witch Trial", duration: "35:00", date: "2024-01-12" },
      { id: 2702, title: "Haunted Places", duration: "40:00", date: "2024-01-05" }
    ]
  }
];

// 类别中文映射
const CATEGORY_MAP = {
  news: '新闻时事',
  tech: '科技',
  business: '商业',
  education: '教育',
  health: '健康',
  society: '社会',
  culture: '文化',
  science: '科学',
  sports: '体育',
  entertainment: '娱乐',
  story: '故事'
};

// 难度中文映射
const DIFFICULTY_MAP = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级'
};