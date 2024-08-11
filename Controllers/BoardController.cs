using Frogmarks.Models.Board;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Frogmarks.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class BoardController : BaseController
    {
        private readonly IBoardService _boardService;
        public BoardController(IBoardService boardService, IErrorService errorService) : base(errorService)
        {
            _boardService = boardService;
        }

        // GET: api/<BoardController>
        [HttpGet]
        public async Task<IActionResult> GetBoards()
        {
            try
            {
                var result = await _boardService.GetAllBoards();
                return Ok(result);
            }
            catch(Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpGet("search")]
        public async Task<IActionResult> SearchBoards(
            [FromQuery] string name = "",
            [FromQuery] long teamId = 0,
            [FromQuery] bool favorites = false,
            [FromQuery] string sortBy = "name",
            [FromQuery] string sortDirection = "desc",
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10)
        {
            try
            {
                var boards = await _boardService.SearchBoards(name, teamId, favorites, sortBy, sortDirection, pageIndex, pageSize);
                return Ok(boards);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET api/<BoardController>/5
        [HttpGet("{id}")]
        public async Task<IActionResult> GetBoardById(long id)
        {
            try
            {
                var result = await _boardService.GetBoardById(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST api/<BoardController>
        [HttpPost]
        public async Task<IActionResult> CreateBoard([FromBody] BoardDto board)
        {
            try
            {
                var result = await _boardService.CreateBoard(board);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // PUT api/<BoardController>/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateBoard([FromBody] BoardDto board)
        {
            try
            {
                var result = await _boardService.UpdateBoard(board);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpPut("favorite")]
        public async Task<IActionResult> FavoritedBoard([FromBody] BoardDto board)
        {
            try
            {
                var result = await _boardService.FavoritedBoard(board);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // DELETE api/<BoardController>/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteBoard(long id)
        {
            try
            {
                var result = await _boardService.DeleteBoard(id);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}
