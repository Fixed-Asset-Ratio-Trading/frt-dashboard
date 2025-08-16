# Browser & API Debugging Guide
**Fixed Ratio Trading Dashboard - Development Debugging Tools**

## 🛠️ **Installed Debugging Tools**

### **Browsers with Developer Tools**
- ✅ **Google Chrome** - Industry standard dev tools
- ✅ **Firefox** - Standard version with good debugging
- ✅ **Firefox Developer Edition** - Enhanced dev tools with superior network monitoring
- ✅ **Safari** - Native macOS browser with WebKit dev tools

### **Command-Line Debugging Tools**
- ✅ **jq** - JSON processor for pretty-printing API responses
- ✅ **HTTPie** - User-friendly HTTP client for API testing
- ✅ **curl** - Standard HTTP client (built-in)
- ✅ **Postman** - GUI API testing platform

## 🌐 **Browser Developer Tools Setup**

### **Firefox Developer Edition (Recommended for Development)**
**Why Firefox Developer Edition?**
- **Superior Network Monitor**: Better API request/response inspection
- **Enhanced Console**: Better error reporting and debugging
- **CSS Grid Inspector**: Better for responsive design debugging
- **Accessibility Tools**: Built-in accessibility testing

**Key Features for Our Dashboard:**
1. **Network Tab**: Monitor ASP.NET Core API calls
2. **Console**: Debug minimal JavaScript interactions
3. **Sources**: Set breakpoints in JavaScript code
4. **Storage**: Inspect localStorage and sessionStorage
5. **Responsive Design Mode**: Test mobile layouts

### **Google Chrome DevTools**
**Excellent for:**
- **Performance profiling** of JavaScript
- **Memory debugging** for memory leaks
- **Security auditing** of HTTPS connections
- **PWA testing** (if we add PWA features later)

### **Safari Web Inspector**
**Best for:**
- **iOS debugging** when testing on mobile devices
- **WebKit-specific issues** debugging
- **Native macOS integration**

## 🔧 **ASP.NET Core JavaScript Debugging Setup**

### **1. Development Environment Configuration**
Add to `src/FixedRatioTrading.Dashboard.Web/appsettings.Development.json`:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.AspNetCore.StaticFiles": "Information"
    }
  },
  "AllowedHosts": "*",
  "DeveloperSettings": {
    "EnableDetailedErrors": true,
    "EnableBrowserLink": true,
    "EnableClientSideDebugging": true
  }
}
```

### **2. Browser DevTools Debugging Workflow**

#### **Step 1: Launch Development Server**
```bash
# Terminal 1: Start ASP.NET Core with debugging
cd src/FixedRatioTrading.Dashboard.Web
dotnet run --environment Development --urls "http://localhost:5000"
```

#### **Step 2: Open Firefox Developer Edition**
```bash
# Launch with remote debugging enabled
open -a "Firefox Developer Edition" --args --remote-debugging-port=9222
```

#### **Step 3: Navigate and Debug**
1. **Open**: `http://localhost:5000`
2. **Press F12** to open DevTools
3. **Select Network Tab** to monitor API calls
4. **Select Console Tab** for JavaScript debugging

### **3. JavaScript Debugging Techniques**

#### **Console Debugging**
```javascript
// In browser console or embedded JavaScript
console.log('Pool data:', window.POOL_DATA);
console.table(window.POOL_DATA); // Table format for arrays
console.group('API Call Debug');
console.log('Request:', requestData);
console.log('Response:', responseData);
console.groupEnd();

// Performance timing
console.time('API Call');
// ... make API call
console.timeEnd('API Call');
```

#### **Breakpoint Debugging**
```javascript
// Add debugger statement in JavaScript
function handlePoolCreation(formData) {
    debugger; // Browser will pause here
    console.log('Form data:', formData);
    
    fetch('/api/pools/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(response => {
        debugger; // Another breakpoint
        return response.json();
    });
}
```

#### **Network Monitoring**
- **Monitor all AJAX calls** to ASP.NET Core controllers
- **Inspect request/response headers** for debugging
- **Check response status codes** for error handling
- **Analyze response times** for performance optimization

## 📡 **Command-Line API Testing**

### **HTTPie Examples (Recommended)**
```bash
# Test health endpoint
http GET localhost:5000/health

# Test pool creation (POST with JSON)
http POST localhost:5000/api/pools/create \
    TokenAAddress=TOKEN_A_MINT_HERE \
    TokenBAddress=TOKEN_B_MINT_HERE \
    RatioANumerator:=10000 \
    RatioBDenominator:=1

# Test with custom headers
http GET localhost:5000/api/pools \
    Authorization:"Bearer TOKEN_HERE" \
    Accept:application/json

# Upload form data
http --form POST localhost:5000/tokens/create \
    Name="Test Token" \
    Symbol=TS \
    Decimals:=6
```

### **curl + jq Examples**
```bash
# Pretty-print JSON response
curl -s http://localhost:5000/api/pools | jq '.'

# Extract specific fields
curl -s http://localhost:5000/api/pools | jq '.[].displayPair'

# Test POST with error handling
curl -X POST http://localhost:5000/api/pools/create \
    -H "Content-Type: application/json" \
    -d '{"TokenAAddress":"invalid","TokenBAddress":"invalid"}' \
    -w "HTTP Status: %{http_code}\n" | jq '.'

# Follow redirects and show headers
curl -L -v -s http://localhost:5000/pools/create 2>&1 | head -20
```

### **Advanced jq Filtering**
```bash
# Filter pools by symbol
curl -s http://localhost:5000/api/pools | jq '.[] | select(.tokenASymbol == "TS")'

# Get only pool addresses and rates
curl -s http://localhost:5000/api/pools | jq '.[] | {address: .poolAddress, rate: .displayInfo.rateText}'

# Count active pools
curl -s http://localhost:5000/api/pools | jq '[.[] | select(.isActive == true)] | length'
```

## 🐛 **Common Debugging Scenarios**

### **1. AJAX Call Not Working**
**Browser DevTools Investigation:**
1. **Network Tab**: Check if request is being sent
2. **Console Tab**: Look for JavaScript errors
3. **Response Tab**: Inspect server response
4. **Headers Tab**: Verify Content-Type and status codes

**Command Line Verification:**
```bash
# Test the same endpoint directly
http POST localhost:5000/api/pools/create \
    TokenAAddress=MINT_A \
    TokenBAddress=MINT_B \
    RatioANumerator:=1000 \
    RatioBDenominator:=1
```

### **2. Server-Side Rendering Issues**
**HTML Inspection:**
```bash
# Get rendered HTML
curl -s http://localhost:5000/pools/create | grep -A 10 -B 10 "pool-creation-form"

# Check for JavaScript constants
curl -s http://localhost:5000/ | grep "window.POOL_DATA"
```

### **3. API Response Debugging**
**Response Analysis:**
```bash
# Check response headers
curl -I http://localhost:5000/api/pools

# Validate JSON structure
curl -s http://localhost:5000/api/pools | jq 'type'

# Test error responses
curl -s http://localhost:5000/api/pools/invalid-id | jq '.error'
```

### **4. CORS Issues (Local Development)**
**Browser Console Error**: `"Cross-Origin Request Blocked"`

**Solution**: Add to ASP.NET Core `Program.cs`:
```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevelopmentCors", policy =>
    {
        policy.WithOrigins("http://localhost:5000")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Enable CORS in development
if (app.Environment.IsDevelopment())
{
    app.UseCors("DevelopmentCors");
}
```

## 🔍 **Performance Debugging**

### **Browser Performance Monitoring**
```javascript
// Monitor page load performance
window.addEventListener('load', function() {
    const perfData = performance.getEntriesByType('navigation')[0];
    console.log('Page Load Time:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
    console.log('DOM Ready Time:', perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart, 'ms');
});

// Monitor API call performance
function monitorApiCall(url, options) {
    const startTime = performance.now();
    
    return fetch(url, options)
        .then(response => {
            const endTime = performance.now();
            console.log(`API Call to ${url}: ${endTime - startTime}ms`);
            return response;
        });
}
```

### **Server Response Time Monitoring**
```bash
# Measure response times
curl -w "Connect: %{time_connect}s\nTime to first byte: %{time_starttransfer}s\nTotal time: %{time_total}s\n" \
     -o /dev/null -s http://localhost:5000/api/pools

# Load testing with multiple requests
for i in {1..10}; do
    curl -w "%{time_total}s\n" -o /dev/null -s http://localhost:5000/health
done
```

## 📱 **Mobile Debugging**

### **Responsive Design Testing**
1. **Firefox DevTools**: Toggle Device Toolbar (Ctrl+Shift+M)
2. **Chrome DevTools**: Device Mode (Ctrl+Shift+M)
3. **Test Common Breakpoints**: 320px, 768px, 1024px, 1200px

### **iOS Safari Debugging** (if testing on iPhone)
1. **Enable**: Settings → Safari → Advanced → Web Inspector
2. **Connect**: Safari → Develop → [Device Name] → localhost
3. **Debug**: Full Safari Web Inspector on your Mac

## 🚀 **Debugging Best Practices**

### **1. Structured Logging**
```javascript
// Use structured console logging
const Logger = {
    api: (action, data) => console.group(`🌐 API: ${action}`, data),
    ui: (action, data) => console.group(`🖥️ UI: ${action}`, data),
    error: (action, error) => console.error(`❌ Error: ${action}`, error),
    endGroup: () => console.groupEnd()
};

// Usage
Logger.api('Pool Creation', { poolId: 'abc123', tokens: ['TS', 'MST'] });
Logger.endGroup();
```

### **2. Environment-Specific Debugging**
```javascript
// Only log in development
const isDevelopment = window.location.hostname === 'localhost';

function debugLog(message, data) {
    if (isDevelopment) {
        console.log(message, data);
    }
}
```

### **3. Error Boundary Debugging**
```javascript
// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global Error:', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack
    });
});

// Unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
});
```

## 📋 **Quick Reference Commands**

### **Start Debugging Session**
```bash
# Terminal 1: Start server with debugging
cd src/FixedRatioTrading.Dashboard.Web && dotnet run --environment Development

# Terminal 2: Monitor logs
tail -f logs/application.log

# Terminal 3: API testing ready
# (Use http, curl, or jq commands)
```

### **Browser DevTools Shortcuts**
- **F12**: Open/close DevTools
- **Ctrl+Shift+C**: Inspect element
- **Ctrl+Shift+K**: Open console (Firefox)
- **Ctrl+Shift+J**: Open console (Chrome)
- **Ctrl+Shift+I**: Open DevTools (all browsers)
- **Ctrl+R**: Refresh page
- **Ctrl+Shift+R**: Hard refresh (ignore cache)

### **Useful Browser Console Commands**
```javascript
// Clear console
clear()

// Inspect DOM element
$('#elementId') // jQuery-style selector

// Monitor function calls
monitor(functionName)
unmonitor(functionName)

// Copy to clipboard
copy(object)

// Table view of array data
table(arrayData)
```

---

## 🎯 **Integration with ASP.NET Core Development**

This debugging setup perfectly complements our server-side C# development:

1. **Server-Side Debugging**: Visual Studio/VS Code breakpoints in C#
2. **Client-Side Debugging**: Browser DevTools for minimal JavaScript
3. **API Testing**: HTTPie/Postman for endpoint validation
4. **Performance Monitoring**: Both server-side metrics and client-side timing

The combination gives us **complete visibility** into both the server-side ASP.NET Core application and the client-side user interactions! 