import { Story } from '../types';
interface GeneratedPdfBackup {
    blob: Blob;
    fileName: string;
}
export declare function createPdfBackupBlob(story: Story): Promise<GeneratedPdfBackup>;
export {};
