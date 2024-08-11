using Frogmarks.SignalR.Hubs;
using Frogmarks.Utilities;

namespace Frogmarks.SignalR.Optimizers
{
    public class BatchService
    {
        private readonly BoardHub _boardHub; 
        public BatchService(BoardHub boardHub)
        {
            _boardHub = boardHub;
        }

        Dictionary<BatchTypes, HashSet<long>> CurrentBatch { get; set; }

        public async Task Batch(BatchTypes batchType, long batchItemId)
        {
            if(CurrentBatch.Count() == 0)
            {
                await StartBatchBuffer(batchType, batchItemId);
            }
            else
            {
                CurrentBatch[batchType].Add(batchItemId);
            }
        }

        public async Task StartBatchBuffer(BatchTypes batchType, long firstItemToBatch)
        {
            CurrentBatch[batchType].Add(firstItemToBatch);

            // Collect updates for 3 seconds before SignalR notification
            await Task.Delay(3000);
            await CompleteCurrentBatch();
        }

        public async Task CompleteCurrentBatch()
        {
            // Notify clients of updates based on BatchTypes
            foreach ((var batchType, var batchIds) in CurrentBatch)
            {
                switch (batchType)
                {
                    case BatchTypes.Board:
                        await _boardHub.SendBoardUpdate(batchIds.ToList());
                        break;
                    case BatchTypes.BoardItem:
                        await _boardHub.SendBoardUpdate(batchIds.ToList());
                        break;
                    default: break;
                }
            }

            // Clear out the current batch
            CurrentBatch.Clear();
        }
    }
}
