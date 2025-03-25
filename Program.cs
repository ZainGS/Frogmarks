using Frogmarks.Auth;
using Frogmarks.Data;
using Frogmarks.Models;
using Frogmarks.Models.Email;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Frogmarks.SignalR.Hubs;
using Frogmarks.SignalR.Optimizers;
using Frogmarks.WebSockets;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json.Serialization;
using Azure.Storage.Blobs;

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
builder.Services.AddScoped<IBoardService, BoardService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<ITeamUserService, TeamUserService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<BatchService>();
builder.Services.AddScoped<TokenGenerator>();
builder.Services.AddSingleton(x => new BlobServiceClient(builder.Configuration["AzureBlobStorage:ConnectionString"]));

// Register Hubs
builder.Services.AddSingleton<BoardHub>(); // Register BoardHub, if it doesn't depend on scoped services, otherwise use 
builder.Services.Configure<AzureCommunicationServicesSettings>(builder.Configuration.GetSection("AzureCommunicationServices"));

// Read the Azure SignalR connection string from configuration
string signalRConnectionString = builder.Configuration["AzureSignalR:ConnectionString"]
    ?? throw new InvalidOperationException("Azure SignalR connection string is not set.");

// Add Azure SignalR service
builder.Services.AddSignalR().AddAzureSignalR(signalRConnectionString);

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

// Add CORS policy
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp",
        builder => builder
            .WithOrigins("http://localhost:44452", "https://localhost:44452")
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
app.UseRouting();

// Use session middleware
app.UseSession();

app.UseMiddleware<JwtMiddleware>(builder.Configuration["JwtSettings:SecretKey"]);

app.UseAuthentication();
app.UseAuthorization();

// Enable WebSocket support
app.UseWebSockets();

app.MapControllers();
app.MapRazorPages();
app.MapHub<BoardHub>("/boardHub");
app.MapFallbackToFile("index.html");

// Map WebSocket endpoint
app.Map("/ws", async context =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        var webSocketService = context.RequestServices.GetRequiredService<IWebSocketService>();
        await webSocketService.HandleWebSocketConnection(webSocket);
    }
    else
    {
        context.Response.StatusCode = 400;
    }
});

app.Run();