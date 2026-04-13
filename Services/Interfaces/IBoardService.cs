using Frogmarks.Models.Board;
using Frogmarks.Models.Dtos.Board;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface IBoardService
    {
        Task<ResultModel<IEnumerable<Board>>> GetAllBoards();
        Task<ResultModel<BoardDto>> GetBoardById(long id);
        Task<ResultModel<BoardDto>> GetBoardByUid(Guid uid);
        Task<ResultModel<Board>> CreateBoard(BoardDto board);
        Task<ResultModel<Board>> UpdateBoard(BoardDto Board);
        Task<ResultModel<string>> SaveBoardSceneGraph(long boardId, string sceneGraph);
        Task<ResultModel<string>> LoadBoardSceneGraph(long boardId);
        Task<ResultModel<Board>> DeleteBoard(long id);
        Task<ResultModel<IEnumerable<BoardDto>>> SearchBoards(string name, long teamId, bool favorites, string sortBy, string sortDirection, int pageIndex, int pageSize, HashSet<long> cachedThumbnailBoardIds, bool isArchived);
        Task<ResultModel<Board>> FavoritedBoard(BoardDto boardDto);
        Task<ResultModel<string>> UploadThumbnail(string boardUid, IFormFile thumbnail, bool? setCustom);
        Task<ResultModel<BoardDto>> DuplicateBoard(
            long sourceBoardId,
            string? nameOverride,
            long? targetTeamId,
            bool copyThumbnail
        );
        Task<ResultModel<BoardDto>> RenameBoard(long boardId, string newName);
        // public Task<string> GetThumbnailSasUrl(string boardUid);
        // Task<ResultModel<Stream>> GetThumbnail(string boardUid); 
    }
}