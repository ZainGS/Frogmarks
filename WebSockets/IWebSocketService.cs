using Frogmarks.Models.Board;
using System.Net.WebSockets;

namespace Frogmarks.WebSockets
{
    public interface IWebSocketService
    {
        Task HandleWebSocketConnection(WebSocket webSocket);
        Task BroadcastBoardUpdate(Board board);
    }
}
