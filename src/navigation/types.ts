export type RootStackParamList = {
  Library: undefined;
  Player: { itemId: string; seekMs?: number; seekToken?: number };
  ListenHistory: { itemId?: string } | undefined;
};
