using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Frogmarks.Models.Board;
using Newtonsoft.Json;

namespace Frogmarks.WebSockets
{
    public class WebSocketService : IWebSocketService
    {
        private readonly ConcurrentBag<WebSocket> _sockets = new ConcurrentBag<WebSocket>();

        public async Task HandleWebSocketConnection(WebSocket webSocket)
        {
            _sockets.Add(webSocket);

            var buffer = new byte[1024 * 4];
            var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            while (!result.CloseStatus.HasValue)
            {
                result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            }

            _sockets.TryTake(out webSocket);
            await webSocket.CloseAsync(result.CloseStatus.Value, result.CloseStatusDescription, CancellationToken.None);
        }

        public async Task BroadcastBoardUpdate(Board board)
        {
            var message = JsonConvert.SerializeObject(board);
            var buffer = Encoding.UTF8.GetBytes(message);

            foreach (var socket in _sockets)
            {
                if (socket.State == WebSocketState.Open)
                {
                    await socket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
        }
    }
}
