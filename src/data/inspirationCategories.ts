import { ArtStyle } from '../types';
import { demoStories } from './demoStories';

export interface InspirationExample {
    id: string;
    title: string;
    prompt: string;
    artStyle: ArtStyle;
    coverImage: string;
    storyId?: string; // Links to a demo story if available
}

export interface InspirationCategory {
    id: string;
    title: string;
    subtitle: string;
    ctaText: string;
    examples: InspirationExample[];
}

export const inspirationCategories: Record<string, InspirationCategory> = {
    army: {
        id: 'army',
        title: "חוזרים הביתה גיבורים 🎖️",
        subtitle: "החבר'ה שלי היו 100 יום בעזה. רציתי ספר קומיקס שיהפוך אותם ל'נוקמים', עם בדיחות על הטונה והבוץ.",
        ctaText: "יאללה, תעשו לנו ספר כזה 👈",
        examples: [
            {
                id: 'army-1',
                title: "צוות 8 חוזר הביתה",
                prompt: "החבר'ה שלי היו 100 יום בעזה. רציתי ספר קומיקס שיהפוך אותם ל'נוקמים', עם בדיחות על הטונה והבוץ.",
                artStyle: ArtStyle.Comic,
                coverImage: '/placeholder.svg',
                storyId: 'army'
            },
            {
                id: 'army-2',
                title: "סופר-אבא מוריד מדים",
                prompt: "אבא חוזר ממילואים. ספר שמסביר לילד שאבא היה גיבור ושמר עלינו.",
                artStyle: ArtStyle.Pixar,
                coverImage: '/placeholder.svg', // Placeholder
                storyId: 'army'
            }
        ]
    },
    couples: {
        id: 'couples',
        title: "הרומנטיקה שלכם, הגרסה המאויירת 🌹",
        subtitle: "מהדייט הראשון בטינדר ועד הצעת הנישואין בחוף. הנה כמה ספרים שיצרנו לזוגות שרצו להנציח את הרגעים שלהם.",
        ctaText: "יאללה, תעשו לנו ספר כזה 👈",
        examples: [
            {
                id: 'couples-1',
                title: "איך פגשתי את אמא (בטינדר)",
                prompt: "הסיפור האמיתי והמצחיק על הדייט הראשון שלנו שהיה אסון, אבל נגמר בחתונה. סגנון קומיקס.",
                artStyle: ArtStyle.Comic,
                coverImage: '/placeholder.svg',
                storyId: 'couples'
            },
            {
                id: 'couples-2',
                title: "הנסיכה וההייטקיסט",
                prompt: "אנחנו חוגגים שנה. רציתי ספר בסגנון אגדה קלאסית שמראה אותנו בתור נסיך ונסיכה.",
                artStyle: ArtStyle.DisneyClassic,
                coverImage: '/placeholder.svg', // Placeholder
                storyId: 'couples'
            },
            {
                id: 'couples-3',
                title: "דניאל ונועה כובשים את תאילנד",
                prompt: "ביקשו ספר על הטיול הגדול שלהם, בסגנון דיסני, עם דגש על הקוף שגנב להם את הבננה.",
                artStyle: ArtStyle.Pixar,
                coverImage: '/placeholder.svg', // Placeholder
                storyId: 'couples'
            }
        ]
    },
    farewell: {
        id: 'farewell',
        title: "המשרד, עונה פינאלה 💼",
        subtitle: "הקולגה עוזב? ספר פרידה הומוריסטי שמתעד את כל הרגעים המשרדיים שאסור לספר בראיון עבודה.",
        ctaText: "יאללה, תעשו לנו ספר כזה 👈",
        examples: [
            {
                id: 'farewell-1',
                title: "עלילות יוסי והמדפסת",
                prompt: "יוסי עוזב את הצוות. ספר פרידה שמנציח את כל הפדיחות שלו במשרד ואת האהבה שלו לקפה שחור.",
                artStyle: ArtStyle.Comic,
                coverImage: '/placeholder.svg',
                storyId: 'farewell'
            }
        ]
    },
    kids: {
        id: 'kids',
        title: "חלומות שמתגשמים על הנייר 🚀",
        subtitle: "למה לקרוא על 'דני הולך לים' כשאפשר לקרוא על עצמך רוכב על דרקון? הדרך הכי בטוחה לגרום להם להתאהב בקריאה.",
        ctaText: "יאללה, תעשו לנו ספר כזה 👈",
        examples: [
            {
                id: 'kids-1',
                title: "נעם טס לירח",
                prompt: "הוא חולה על חלל ודינוזאורים. תשלבו את שניהם.",
                artStyle: ArtStyle.Pixar,
                coverImage: '/placeholder.svg',
                storyId: 'kids'
            }
        ]
    }
};
