export interface PracticeLogsResult {
  data: string[] | null
  averageMinutes: number | null
  error: Error | null
}

export interface PendingIncomingFriendRow {
  requester_id: string
  username: string
}

export interface EquippedInventoryRow {
  item_id: string
  type: string
}

