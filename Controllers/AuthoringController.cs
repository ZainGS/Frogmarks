using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace Frogmarks.Controllers
{
    [AllowAnonymous]
    [Route("api/authoring")]
    [ApiController]
    public class AuthoringController : ControllerBase
    {
        private readonly IHttpClientFactory _http;
        private readonly IConfiguration _cfg;

        public AuthoringController(IHttpClientFactory http, IConfiguration cfg)
        {
            _http = http;
            _cfg = cfg;
        }

        [HttpPost]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> Post([FromBody] JsonElement body)
        {
            var apiKey = _cfg["Anthropic:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
                return StatusCode(503, "Anthropic:ApiKey not configured — set it in user secrets");

            var allowedModels = new HashSet<string> {
                "claude-haiku-4-5-20251001",
                "claude-sonnet-5",
                "claude-opus-5",
            };
            var model = body.TryGetProperty("model", out var modelEl) ? modelEl.GetString() : null;
            if (string.IsNullOrEmpty(model) || !allowedModels.Contains(model))
                model = "claude-haiku-4-5-20251001";

            var thinkingEnabled = body.TryGetProperty("thinkingEnabled", out var teEl) && teEl.GetBoolean();
            var thinkingEffort = body.TryGetProperty("thinkingEffort", out var efEl) ? efEl.GetString() ?? "high" : "high";

            // System prompt as a content-block array so we can attach cache_control.
            var systemText = body.GetProperty("system").GetString() ?? "";
            var systemBlocks = new[]
            {
                new Dictionary<string, object?> {
                    ["type"]          = "text",
                    ["text"]          = systemText,
                    ["cache_control"] = new { type = "ephemeral" },
                }
            };

            // Tools: deserialise each element, stamp cache_control on the last one, re-serialise.
            // Raw JsonElement pass-through is preserved for all tool fields so snake_case survives
            // MVC's camelCase serialiser.
            var toolsEl = body.GetProperty("tools");
            var tools = toolsEl.EnumerateArray()
                .Select(t => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(t.GetRawText())!
                             .ToDictionary(kv => kv.Key, kv => (object?)kv.Value))
                .ToList();
            if (tools.Count > 0)
                tools[^1]["cache_control"] = new { type = "ephemeral" };

            var maxTokens = body.GetProperty("maxTokens").GetInt32();
            if (thinkingEnabled)
                maxTokens = Math.Max(maxTokens, 16000);

            var anthropicReq = new Dictionary<string, object?>
            {
                ["model"]      = model,
                ["max_tokens"] = maxTokens,
                ["system"]     = systemBlocks,
                ["tools"]      = tools,
                ["messages"]   = body.GetProperty("messages"),
            };
            if (thinkingEnabled)
            {
                anthropicReq["thinking"] = new { type = "adaptive" };
                anthropicReq["output_config"] = new { effort = thinkingEffort };
            }

            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(5);

            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
            req.Headers.Add("x-api-key", apiKey);
            req.Headers.Add("anthropic-version", "2023-06-01");
            req.Headers.Add("anthropic-beta", "prompt-caching-2024-07-31");
            req.Content = new StringContent(
                JsonSerializer.Serialize(anthropicReq), Encoding.UTF8, "application/json");

            var resp = await client.SendAsync(req);
            var json = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
                return StatusCode((int)resp.StatusCode, json);

            // Return { content, stop_reason } verbatim via Content() — bypasses MVC's camelCase policy.
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var passthrough = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["content"]     = root.GetProperty("content"),
                ["stop_reason"] = root.GetProperty("stop_reason"),
                ["usage"]       = root.TryGetProperty("usage", out var usage) ? usage : (object?)null,
            });

            return Content(passthrough, "application/json");
        }
    }
}
