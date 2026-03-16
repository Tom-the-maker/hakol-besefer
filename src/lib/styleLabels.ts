import { ArtStyle } from '../types';

export const STYLE_LABELS_HE: Record<string, string> = {
    [ArtStyle.Pixar]: 'פיקסאר',
    [ArtStyle.Watercolor]: 'צבעי מים',
    [ArtStyle.Comic]: 'קומיקס',
    [ArtStyle.Pencil]: 'עיפרון',
    [ArtStyle.Dreamy]: 'שמן חלומי',
    [ArtStyle.Anime]: 'אנימה',
    [ArtStyle.Claymation]: 'סטופ מושן',
    [ArtStyle.DisneyClassic]: 'דיסני קלאסי',
    [ArtStyle.Cyberpunk]: 'סייברפאנק',
};

export const getStyleDisplayLabel = (style: string) => STYLE_LABELS_HE[style] || style;
