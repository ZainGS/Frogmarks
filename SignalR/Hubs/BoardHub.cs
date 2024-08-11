using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace Frogmarks.SignalR.Hubs
{
    public class BoardHub : Hub
    {
        public async Task SendMessage(string user, string message)
        {
            await Clients.All.SendAsync("ReceiveMessage", user, message);
        }

        public async Task SendBoardUpdate(List<long> boardIds)
        {
            await Clients.All.SendAsync("BoardUpdate", boardIds);
        }

        public async Task SendBoardItemUpdate(List<long> boardItemIds)
        {
            await Clients.All.SendAsync("BoardItemUpdate", boardItemIds);
        }
    }
}
