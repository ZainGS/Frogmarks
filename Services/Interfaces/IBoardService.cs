using Frogmarks.Models.Board;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface IBoardService
    {
        Task<ResultModel<IEnumerable<Board>>> GetAllBoards();
        Task<ResultModel<Board>> GetBoardById(long id);
        Task<ResultModel<Board>> CreateBoard(BoardDto board);
        Task<ResultModel<Board>> UpdateBoard(BoardDto Board);
        Task<ResultModel<Board>> DeleteBoard(long id);
        Task<ResultModel<IEnumerable<BoardDto>>> SearchBoards(string name, long teamId, bool favorites, string sortBy, string sortDirection, int pageIndex, int pageSize);
        Task<ResultModel<Board>> FavoritedBoard(BoardDto boardDto);
    }
}