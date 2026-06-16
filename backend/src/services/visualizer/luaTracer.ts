/**
 * Execution visualizer — Lua tracer (Tier-A: in-language via debug.sethook, no ptrace).
 *
 * Loads the user code as a named chunk ("user"), installs a line hook, and at each user
 * line walks the call stack (debug.getinfo/getlocal per level) to build the unified trace,
 * which it prints as hand-rolled JSON between sentinels (Lua has no built-in JSON).
 * Targets Lua 5.1 (loadstring). On any malformed output the parser simply yields no trace.
 */
import { TRACE_BEGIN, TRACE_END, DEFAULT_MAX_STEPS, clampMaxSteps } from "./trace";

export function buildLuaTracerScript(userCode: string, maxSteps: number = DEFAULT_MAX_STEPS): string {
  const cap = clampMaxSteps(maxSteps);
  // Embed source as a Lua long-bracket string is unsafe if code contains ]]. Use decimal
  // byte escapes via a generated table to avoid any delimiter collision.
  const bytes = Buffer.from(String(userCode ?? ""), "utf8");
  const byteList = Array.from(bytes).join(",");
  return `local _SRC_BYTES = {${byteList}}
local _src = ""
do
  local t = {}
  for i = 1, #_SRC_BYTES do t[i] = string.char(_SRC_BYTES[i]) end
  _src = table.concat(t)
end

local _MAX = ${cap}
local _steps = {}
local _truncated = false

local function _jstr(s)
  s = tostring(s)
  s = s:gsub('[%z\\1-\\31\\\\"]', function(c)
    local m = { ['"'] = '\\\\"', ['\\\\'] = '\\\\\\\\', ['\\n'] = '\\\\n', ['\\r'] = '\\\\r', ['\\t'] = '\\\\t' }
    return m[c] or string.format('\\\\u%04x', string.byte(c))
  end)
  return '"' .. s .. '"'
end

local function _snapshot()
  local frames = {}
  local lvl = 3 -- 1=_snapshot, 2=hook, 3=user frame
  while true do
    local info = debug.getinfo(lvl, "nSl")
    if not info then break end
    if info.short_src == "user" then
      local locs = {}
      local i = 1
      while true do
        local n, v = debug.getlocal(lvl, i)
        if not n then break end
        if n:sub(1, 1) ~= "(" then locs[#locs + 1] = _jstr(n) .. ":" .. _jstr(v) end
        i = i + 1
        if i > 60 then break end
      end
      local fname = info.name or (info.what == "main" and "<module>") or "?"
      local frameJson = '{"func":' .. _jstr(fname) .. ',"line":' .. tostring(info.currentline or 0) ..
        ',"locals":{' .. table.concat(locs, ",") .. '}}'
      table.insert(frames, 1, frameJson) -- level grows toward caller; front-insert => bottom..top
    end
    lvl = lvl + 1
    if lvl > 60 then break end
  end
  return frames
end

local function _hook(event, line)
  if _truncated then return end
  local info = debug.getinfo(2, "S")
  if not info or info.short_src ~= "user" then return end
  if event == "line" then
    if #_steps >= _MAX then _truncated = true; return end
    local frames = _snapshot()
    local topLine = line or 0
    local step = '{"line":' .. tostring(topLine) .. ',"event":"line","stack":[' .. table.concat(frames, ",") .. ']}'
    _steps[#_steps + 1] = step
  end
end

local _chunk, _err = loadstring(_src, "=user")
if not _chunk then
  io.stderr:write(tostring(_err) .. "\\n")
else
  debug.sethook(_hook, "l")
  local ok, rerr = pcall(_chunk)
  debug.sethook()
  if not ok then io.stderr:write(tostring(rerr) .. "\\n") end
end

print("${TRACE_BEGIN}")
print('{"steps":[' .. table.concat(_steps, ",") .. '],"truncated":' .. tostring(_truncated) .. '}')
print("${TRACE_END}")
`;
}
