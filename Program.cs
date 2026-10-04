using Frogmarks.Auth;
using Frogmarks.Data;
using Frogmarks.Models;
using Frogmarks.Models.Email;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.Json.Serialization;
using Azure.Storage.Blobs;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// Load the secret key from configuration
var secretKey = builder.Configuration["JwtSettings:SecretKey"];

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    options.UseSqlServer(connectionString, sqlServerOptions =>
    {
        sqlServerOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null);
    });
    options.UseLazyLoadingProxies(); // Enable lazy loading proxies
});

builder.Services.AddDatabaseDeveloperPageExceptionFilter();

builder.Services.AddDefaultIdentity<ApplicationUser>(options => options.SignIn.RequireConfirmedAccount = false)
    .AddEntityFrameworkStores<ApplicationDbContext>();

builder.Services.AddIdentityServer()
    .AddApiAuthorization<ApplicationUser, ApplicationDbContext>();

// Ensure the Authority is a valid URL if you need it
var issuer = builder.Configuration["JwtSettings:Issuer"];
var audience = builder.Configuration["JwtSettings:Audience"];
var authority = builder.Configuration["JwtSettings:Authority"] ?? issuer;

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });


builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.LoginPath = "/login"; // Set your login path here
        options.AccessDeniedPath = "/access-denied";
        options.ExpireTimeSpan = TimeSpan.FromDays(14); // Set cookie expiration
        options.SlidingExpiration = true; // Enable sliding expiration
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.Always : CookieSecurePolicy.Always; // Use Always for HTTPS in production
        options.Cookie.SameSite = builder.Environment.IsDevelopment() ? SameSiteMode.None : SameSiteMode.None;
        options.Events = new CookieAuthenticationEvents
        {
            OnRedirectToLogin = ctx =>
            {
                if (ctx.Request.Path.StartsWithSegments("/api"))
                {
                    ctx.Response.StatusCode = 401;
                }
                else
                {
                    ctx.Response.Redirect(ctx.RedirectUri);
                }
                return Task.CompletedTask;
            },
            OnRedirectToAccessDenied = ctx =>
            {
                if (ctx.Request.Path.StartsWithSegments("/api"))
                {
                    ctx.Response.StatusCode = 403;
                }
                else
                {
                    ctx.Response.Redirect(ctx.RedirectUri);
                }
                return Task.CompletedTask;
            }
        };
    });

/*
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme; // Default to JWT
})
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
{
    options.LoginPath = "/login"; // Set your login path here
    options.ExpireTimeSpan = TimeSpan.FromDays(14); // Set cookie expiration
    options.SlidingExpiration = true; // Enable sliding expiration
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; // Use Always for HTTPS in production
    options.Cookie.SameSite = builder.Environment.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.None;
})
.AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
{
    options.RequireHttpsMetadata = false; // Disable HTTPS requirement for development
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey))
    };
});
*/

// Rate limits (security audit 2026-10-04, Phase 1.4 / 1.5). Partitioned per signed-in user, else per client IP.
static string RateKey(HttpContext ctx) =>
    ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // AI authoring proxies to Anthropic on the server's key: bound the cost per user.
    options.AddPolicy("authoring", ctx => RateLimitPartition.GetFixedWindowLimiter(RateKey(ctx), _ =>
        new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
    // Sign-in / magic-link / re-auth endpoints: slow down guessing and email spamming.
    options.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ =>
        new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }));
});

builder.Services.AddMemoryCache();   // re-auth attempt counters (EmailService)

// Add session services
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

builder.Services.AddAuthorization();

/*
builder.Services.AddAuthorization(options =>
{
    var defaultAuthorizationPolicyBuilder = new AuthorizationPolicyBuilder(
 //       CookieAuthenticationDefaults.AuthenticationScheme,
        JwtBearerDefaults.AuthenticationScheme);
    defaultAuthorizationPolicyBuilder =
        defaultAuthorizationPolicyBuilder.RequireAuthenticatedUser();
    options.DefaultPolicy = defaultAuthorizationPolicyBuilder.Build();
});
*/

// Registering ApplicationDbContext and IApplicationDbContext
builder.Services.AddScoped<IApplicationDbContext, ApplicationDbContext>();

// Register AutoMapper
builder.Services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());

// Register services
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddTransient<IErrorService, ErrorService>();
builder.Services.AddScoped<IResourceAccessService, ResourceAccessService>();   // owner / team / collaborator checks
builder.Services.AddScoped<IBoardService, BoardService>();
builder.Services.AddScoped<IIllustrationService, IllustrationService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<ITeamUserService, TeamUserService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<TokenGenerator>();

// Blob storage: use local filesystem in Development, Azure Blob Storage otherwise
if (builder.Environment.IsDevelopment() && string.IsNullOrEmpty(builder.Configuration["AzureBlobStorage:ConnectionString"]))
{
    builder.Services.AddSingleton<IBlobStorageProvider>(sp =>
    {
        var env = sp.GetRequiredService<IWebHostEnvironment>();
        return new LocalBlobStorageProvider(env.WebRootPath);
    });
}
else
{
    builder.Services.AddSingleton(x => new BlobServiceClient(builder.Configuration["AzureBlobStorage:ConnectionString"]));
    builder.Services.AddSingleton<IBlobStorageProvider, AzureBlobStorageProvider>();
}

builder.Services.Configure<AzureCommunicationServicesSettings>(builder.Configuration.GetSection("AzureCommunicationServices"));

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "My API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement{
    {
        new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference
            {
                Type = ReferenceType.SecurityScheme,
                Id = "Bearer"
            }
        },
        new string[] {}
    }});
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();

// Add CORS policy
builder.Services.AddCors(options =>
{
    // Only our frontend may call the API with credentials. Set Cors:AllowedOrigins per environment (array); the default
    // is the local dev server.
    var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
        ?? new[] { "http://localhost:44452", "https://localhost:44452" };
    options.AddPolicy("AllowAngularApp",
        builder => builder
            .WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            //.AllowAnyOrigin());
            .AllowCredentials());
});

var app = builder.Build();

// Apply migrations on startup
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    dbContext.Database.Migrate();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
    // Apply the CORS policy
    app.UseCors("AllowAngularApp");

    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API V1");
    });

}
else
{
    // The default HSTS value is 30 days. You may want to chang e this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
    // Apply the CORS policy
    app.UseCors("AllowAngularApp");
}

app.UseHttpsRedirection();
app.UseStaticFiles();

// Serve local blob storage files in development
if (app.Environment.IsDevelopment())
{
    var blobStoragePath = Path.Combine(app.Environment.WebRootPath, "blob-storage");
    Directory.CreateDirectory(blobStoragePath);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(blobStoragePath),
        RequestPath = "/blob-storage"
    });
}

app.UseRouting();

// Use session middleware
app.UseSession();

app.UseMiddleware<JwtMiddleware>(builder.Configuration["JwtSettings:SecretKey"]);

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();   // after authentication, so policies can partition by user

// CSRF (security audit 2026-10-04): auth is a SameSite=None cookie, so a cross-site page could otherwise make the
// browser send state-changing API calls with it. Those calls must carry X-Requested-With: a page on another origin can't
// add a custom header without a CORS preflight, and the CORS policy only admits our frontend. Requests without auth
// cookies (sign-in, public views) are unaffected.
app.Use(async (ctx, next) =>
{
    var method = ctx.Request.Method;
    var safe = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method);
    if (!safe && ctx.Request.Path.StartsWithSegments("/api")
        && (ctx.Request.Cookies.ContainsKey("accessToken") || ctx.Request.Cookies.ContainsKey("refreshToken"))
        && !ctx.Request.Headers.ContainsKey("X-Requested-With"))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsync("Missing X-Requested-With header.");
        return;
    }
    await next();
});

app.MapControllers();
app.MapRazorPages();
app.MapFallbackToFile("index.html");

app.Run();