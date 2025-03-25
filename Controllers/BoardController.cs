using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs;
using Frogmarks.Models.DTOs;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Frogmarks.Utilities;
using Frogmarks.Models.Dtos;

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
            [FromQuery] int pageSize = 10,
            [FromQuery] string cachedThumbnailBoardIds = "")
        {
            try
            {
                // Pre-allocate the HashSet length and then assign values to avoid internal HashSet resizing.
                var splitIds = cachedThumbnailBoardIds?.Split(',') ?? Array.Empty<string>();
                var boardIds = new HashSet<long>(splitIds.Length);
                foreach (var id in splitIds) {
                    if (long.TryParse(id, out var longId))
                    {
                        boardIds.Add(longId);
                    }
                }
                var boards = await _boardService.SearchBoards(name, teamId, favorites, sortBy, sortDirection, pageIndex, pageSize, boardIds);
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

        [HttpGet("GetBoardByUid/{uid}")]
        public async Task<IActionResult> GetBoardByUid(Guid uid)
        {
            try
            {
                var result = await _boardService.GetBoardByUid(uid);
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
        /// <summary>
        /// Updates board-level metadata (name, permissions, etc.), may trigger audit logs or versioning, less frequent than autosaves.
        /// </summary>
        /// <param name="board"></param>
        /// <returns></returns>
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

        /// <summary>
        /// Handles frequent scene graph updates, stores only sceneGraph-related changes, used for background autosaving.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpPost("save")]
        public async Task<IActionResult> SaveBoard([FromBody] BoardRequestDto request)
        {
            try
            {
                var result = await _boardService.SaveBoardSceneGraph(request.BoardId, request.SceneGraphData);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        /// <summary>
        /// Loads the saved sceneGraphData for a given board ID.
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        [HttpGet("load")]
        public async Task<IActionResult> LoadBoard([FromQuery] long boardId)
        {
            try
            {
                var sceneGraphData = await _boardService.LoadBoardSceneGraph(boardId);
                if (sceneGraphData == null)
                {
                    return NotFound(new { error = "Board not found or no sceneGraphData available." });
                }
                return Ok(sceneGraphData);
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

        [HttpPost("thumbnails/{boardUid}")]
        public async Task<IActionResult> UploadThumbnail(string boardUid, [FromForm] IFormFile thumbnail)
        {
            try
            {
                var result = await _boardService.UploadThumbnail(boardUid, thumbnail);
                return GenerateResponseActionResult(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        //[HttpGet("thumbnails/{boardUid}")]
        //public IActionResult GetThumbnailSas(string boardUid)
        //{
        //    try
        //    {
        //        var sasUrl = _boardService.GetThumbnailSasUrl(boardUid);
        //        return Ok(new { url = sasUrl });
        //    }
        //    catch (Exception ex)
        //    {
        //        return HandleErrorActionResult(ex);
        //    }
        //}

        //[HttpGet("thumbnails/{boardUid}")]
        //public async Task<IActionResult> GetThumbnail(string boardUid)
        //{
        //    try
        //    {
        //        var result = await _boardService.GetThumbnail(boardUid);
        //        if (result.ResultType == ResultType.Success)
        //        {
        //            return File(result.ResultObject, "image/png");
        //        }
        //        return GenerateResponseActionResult(result);
        //    }
        //    catch (Exception ex)
        //    {
        //        return HandleErrorActionResult(ex);
        //    }
        //}
    }
}
