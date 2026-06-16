/**
 * Execution visualizer — Ruby tracer (Tier-A: in-language via TracePoint, no ptrace).
 *
 * Wraps user code, evaluates it under a TracePoint(:line,:call,:return) that reconstructs
 * the call stack with per-frame locals and emits the unified trace JSON between sentinels.
 */
import { TRACE_BEGIN, TRACE_END, DEFAULT_MAX_STEPS, clampMaxSteps } from "./trace";

export function buildRubyTracerScript(userCode: string, maxSteps: number = DEFAULT_MAX_STEPS): string {
  const cap = clampMaxSteps(maxSteps);
  const b64 = Buffer.from(String(userCode ?? ""), "utf8").toString("base64");
  return `require 'json'
require 'base64'

_STEPS = []
_MAX = ${cap}
_STACK = []
_DONE = false

def _safe(v, d = 0)
  case v
  when nil, true, false, Integer, Float
    v
  when String
    v[0, 200]
  else
    return v.inspect[0, 120] if d >= 2
    if v.is_a?(Array)
      v.first(50).map { |x| _safe(x, d + 1) }
    elsif v.is_a?(Hash)
      h = {}
      v.first(50).each { |k, val| h[k.to_s[0, 50]] = _safe(val, d + 1) }
      h
    else
      v.inspect[0, 120]
    end
  end
rescue Exception
  "<unrepr>"
end

def _locals_of(b)
  locs = {}
  begin
    b.local_variables.each do |nm|
      name = nm.to_s
      next if name.start_with?("_")
      begin
        locs[name] = _safe(b.local_variable_get(nm))
      rescue Exception
        locs[name] = "<unrepr>"
      end
    end
  rescue Exception
  end
  locs
end

_tp = TracePoint.new(:line, :call, :return) do |t|
  next if _DONE
  next unless t.path == "user.rb"
  begin
    if t.event == :call
      _STACK.push({ "func" => t.method_id.to_s, "line" => t.lineno, "locals" => _locals_of(t.binding) })
    elsif t.event == :return
      _STACK.pop unless _STACK.empty?
    else # :line
      _STACK.push({ "func" => "<module>", "line" => t.lineno, "locals" => {} }) if _STACK.empty?
      top = _STACK[-1]
      top["line"] = t.lineno
      top["locals"] = _locals_of(t.binding)
      if _STEPS.length < _MAX
        snapshot = _STACK.map { |fr| { "func" => fr["func"], "line" => fr["line"], "locals" => fr["locals"].dup } }
        _STEPS.push({ "line" => t.lineno, "event" => "line", "stack" => snapshot, "locals" => top["locals"] })
      end
      _DONE = true if _STEPS.length >= _MAX
    end
  rescue Exception
  end
end

_src = Base64.decode64("${b64}")
begin
  _tp.enable { eval(_src, TOPLEVEL_BINDING, "user.rb") }
rescue Exception => _e
  STDERR.puts(_e.message)
ensure
  _tp.disable rescue nil
end

puts "${TRACE_BEGIN}"
puts JSON.generate({ "steps" => _STEPS, "truncated" => _STEPS.length >= _MAX })
puts "${TRACE_END}"
`;
}
