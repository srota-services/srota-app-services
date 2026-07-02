export interface ChapterTranscodingCompletedMessage {
   chapterId: string;
   audiobookId: string;
   bitrates: number[];
   status: 'completed';
   timestamp: string;
}

export interface ChapterGatingChangedMessage {
   chapterId: string;
   audiobookId: string;
   action: 'created' | 'updated' | 'deleted';
}
