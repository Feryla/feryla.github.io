+++
date = '2025-12-22T13:48:56+01:00'
title = 'Adventures in Zig: Shell'
+++

In my day job I mostly write Java and Javascript, and have been for the last 10+ years. I have never done much lower level programming or anything with manual memory management. I have started learning C/Rust/Zig for fun a few times before, but never stuck with it for more than a few evenings at a time and basically had to start over each time. Over the last year I have had a lot of fun playing with coding agents like Claude Code. This post is not about that. Part of my motivation for starting this project however, is wanting to build something from scratch without relying on AI to do the grunt work for me. I think coding agents are great tools to learn and I know I will be using them more in the future, but I also think they prevent you from getting a proper understanding yourself, and that to learn there needs to be some resistance. So, to keep things balanced I have therefore taken up learning Zig (again), and I have set some ground rules to ensure I write, and hopefully understand, the code myself. First of all I have disabled all AI autocomplete, like copilot, but I still use LSP. Second of all, no code should be written by coding agents. I will still use Claude for assistance, but only to check syntax and talk through my solutions should I get stuck on something. I have instructed it to act like a tutor and to not give away complete solutions. I think that is an ok balance. I could have limited myself to no LLMs at all, but I find that I often make the challenges I set for my self way to restrictive, which leads to me just abandoning them completely. In the hope that I would actually complete something I decided to be more lenient this time. And lastly, once finished with a project, I should write a post about my experience. There are two reasons why I want to write about it. One, I find it is a good way to reflect on the project and I think reflection is an important part of learning. Second, I would like to improve my writing skills. 

# Codecrafters

In one my earlier ventures into learning Zig I signed up for [codecrafters.io](https://codecrafters.io). They offer a set of build your own X challenges aimed at developers with some experience. It fits me pretty well. I often want to build something, but am unsure what to make. Without a guideline I tend to start something and abandon it as soon as I have anything close to a bare minimum. The challenges at Codecrafters gives you an path to follow without holding your hand. They tell you what to implement next, but how you do it is up to you. As long as your code passes the tests they have written for a step, you can move along to the next one. The challenge I started way back when was to build my own shell. I didn't do much, but I had a basic setup going. Codecrafters rotate which challenge is free each month[^1]. Luckily when I took up this project in December 2025 the same challenge was free, so I was able to continue where I left off.

# Phase 1: The basics
The first phase of the project consisted of setting up REPL (Read-Eval-Print Loop) and implementing some basic builtin commands. I try not to over analyze when I start something. I like to start coding and see how it goes. Once I have something rough that works, and an idea of the direction I am taking it, I go back to restructure. 

An early iteration of my code looked like this[^2]: 
```zig
const std = @import("std");

const Command = enum {
    exit,
    echo,
    type,
};

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();

    const stdin = std.io.getStdIn().reader();

    var buffer: [1024]u8 = undefined;
    while (true) {
        try stdout.print("$ ", .{});
        const user_input = try stdin.readUntilDelimiter(&buffer, '\n');

        var parts = std.mem.splitScalar(u8, user_input, ' ');

        var command_string: []const u8 = undefined;
        if (parts.next()) |first_item| {
            command_string = first_item;
        } else {
            continue;
        }

        const command = std.meta.stringToEnum(Command, command_string) orelse {
            try stdout.print("{s}: command not found\n", .{command_string});
            continue;
        };

        switch (command) {
            Command.exit => {
                break;
            },
            Command.echo => {
                try stdout.print("{s}\n", .{parts.rest()});
            },
            Command.type => {
                var sub_command_string: []const u8 = undefined;
                if (parts.next()) |first_item| {
                    sub_command_string = first_item;
                } else {
                    continue;
                }

                _ = std.meta.stringToEnum(Command, sub_command_string) orelse {
                    try stdout.print("{s}: not found\n", .{sub_command_string});
                    continue;
                };

                try stdout.print("{s} is a shell builtin\n", .{sub_command_string});
            },
        }
    }
}

```
Next I added proper input parsing. I kept it simple and just gathered the arguments in an ArrayList. It took some tries to get the quotes and escapes working, but overall I think it went pretty well. The code isn't beautiful, but it is good enough for this. I was still getting used to zig syntax at this point[^3] so I wouldn't say I was cruising, but I was pretty happy with my progress. After adding support for external commands I did my first restructure. I split all the input parsing logic into it's own module, but I kept the ArrayList.

# Phase 2: Pipes and misdirection
Next up in the challenge was redirecting output and piping output from one command to the next. This phase is where my java background got in my way. I started by creating a buffer to store all the output, and then at the end, depending on redirection I would either write it all to stdout or I would create a file and write to that. I had no clue about file descriptors at this point. For piping I had assumed that I could gather all the output from one command and send it to the next sequentially. My initial plan was to just keep the output in memory and pass it along to the next one. It wasn't until I realized the commands should run in parallel when piped that I stopped to analyze more closely. I knew there was gaps in my knowledge, but until this point I didn't know what they were. I did some reading and had a chat with Claude before going back for take two. I set up my REPL loop to fork and had the fork run the command while my main process just orchestrated everything. 

```zig
const pid = try std.posix.fork();
switch (pid) {
    0 => {
        // New fork gets pid 0
        // Run commands here
    },
    else => {
        // Main process gets pid of child
        // Track how many forks I have created
        continue;
    },
}
```

I did quite a big refactor here and thought I had everything sorted, but when running the tests they failed. I had moved execution of builtins to the fork as well, which lead to `cd` breaking. I refactored again, keeping execution of builtins in the main process. I threw out the buffer I made to keep all output and properly redirected stdout to file. 

```zig
// Open file descriptor pointing to file at given path
// with given flags (create/write/append)
const file_fd = try std.posix.open(path, flags, 0o644);
// Redirect fd 1 point to the same place as file_fd
try std.posix.dup2(file_fd, 1);
// stdout will now go to the file instead of to the terminal            
```
`std.posix.dup2(old_fd, new_fd)` tripped me up. I kept putting the arguments in the wrong order. In my head I was saying 1 is my old fd, I should replace that with the new one I just made. In reality what it does is make new_fd point to the same place as old_fd.

I had also been using `std.process.Child` to run my external commands. The better option, at least for a shell, is to use `std.posix.execveZ`. This hands the process over to the new command. It does not return after, so it is crucial to have forked before. `std.process.Child` is a much more expensive abstraction, and with `std.posix.execveZ` I can easily set up pipes and redirects before passing the process along to the new command.

As part of the refactor here I also structured my parsed input a bit better by adding more structs. 
```zig
const std = @import("std");

pub const FileOut = struct {
    path: []const u8,
    append: bool = false,
};

pub const OutType = union(enum) {
    std,
    file: FileOut,
    pub fn deinit(outType: OutType, allocator: std.mem.Allocator) void {
        switch (outType) {
            .std => {},
            .file => |f| {
                allocator.free(f.path);
            },
        }
    }
};

pub const Command = struct {
    out: OutType = OutType.std,
    err_out: OutType = OutType.std,
    args: std.ArrayList([]const u8),
    pub fn deinit(self: *Command, allocator: std.mem.Allocator) void {
        for (self.args.items) |item| {
            allocator.free(item);
        }
        self.args.deinit(allocator);
        self.out.deinit(allocator);
        self.err_out.deinit(allocator);
    }
};

pub const Operator = enum {
    pipe,
    and_then,
};

pub const ChainedCommand = struct {
    command: Command,
    next_op: ?Operator = null,
    pub fn deinit(self: *ChainedCommand, allocator: std.mem.Allocator) void {
        self.command.deinit(allocator);
    }
};

pub const Pipeline = struct {
    commands: []ChainedCommand,

    pub fn deinit(self: *Pipeline, allocator: std.mem.Allocator) void {
        for (self.commands) |*command| {
            command.deinit(allocator);
        }
        allocator.free(self.commands);
    }
};

```

# Phase 3: Readline
Final part of the challenge was to add auto complete and history support. It was recommended to use [readline](https://en.wikipedia.org/wiki/GNU_Readline) for this section. I am a bit ambivalent about this. On the one hand it allowed me to use c interop which is great, but on the other hand I feel like it maybe gave me a bit too much for free. In the end I am happy I went with it. It gave my shell a substantial input upgrade compared to my original stdin solution, as well as making implementation of auto complete and history fairly straight forward. Even though this is a learning project I think it makes sense to use a library when such an established default solution exists. 

Here is a snippet of my code with the use of readline highlighted.
```zig
//...
const c = @cImport({                                                            (1)
    @cInclude("stdio.h");
    @cInclude("readline/readline.h");
    @cInclude("readline/history.h");
});

const BuiltInCommand = enum { exit, echo, type, pwd, cd, history };

pub fn main() !void {
    //...
    c.rl_attempted_completion_function = &completion_function;                  (2)

    while (true) {
        const rl_input = c.readline("$ ");                                      (3)
        if (rl_input == null) {
            break;
        }
        c.add_history(rl_input);                                                (4)

        const input: []const u8 = std.mem.span(rl_input);
        //...
    }
}

fn completion_function(text: [*c]const u8, start: c_int, end: c_int) callconv(.c) [*c][*c]u8 {
    _ = end;
    _ = start;
    return c.rl_completion_matches(text, &command_generator);                   (5)
}

fn command_generator(text: [*c]const u8, state: c_int) callconv(.c) [*c]u8 {    (6)
    const prefix: []const u8 = std.mem.span(text);

    // Struct defined inside function is static and persists through calls.
    const S = struct {
        const allocator = std.heap.page_allocator;
        var built_in_index: usize = 0;
        var external_matches: ?std.ArrayList([]const u8) = null;
        var external_matches_index: usize = 0;
    };

    // readline increments state for each call. The first call for a completion 
    // has state == 0. On first call we generate all potential matches and store 
    // an index to keep track of how many we have returned. We can only return 
    // 1 per call
    if (state == 0) {
        S.built_in_index = 0;
        S.external_matches = get_external_matches(prefix, S.allocator) catch {
            return null;
        };
        S.external_matches_index = 0;
    }

    // Check builtins first
    const built_ins = std.meta.tags(BuiltInCommand);
    for (S.built_in_index..built_ins.len) |i| {
        S.built_in_index += 1;
        const name = @tagName(built_ins[i]);
        if (std.mem.startsWith(u8, name, prefix)) {
            const result: [*c]u8 = @ptrCast(std.c.malloc(name.len + 1) orelse return null);
            @memcpy(result[0..name.len], name);
            result[name.len] = 0;
            return result;
        }
    }

    // Then check externals
    if (S.external_matches) |external_matches| {
        for (S.external_matches_index..external_matches.items.len) |i| {
            S.external_matches_index += 1;
            const name = external_matches.items[i];
            if (std.mem.startsWith(u8, name, prefix)) {
                const result: [*c]u8 = @ptrCast(std.c.malloc(name.len + 1) orelse return null);
                @memcpy(result[0..name.len], name);
                result[name.len] = 0;
                return result;
            }
        }
    }

    if (S.external_matches) |*external_matches| {
        for (external_matches.items) |item| {
            S.allocator.free(item);
        }
        external_matches.deinit(S.allocator);
        S.external_matches = null;
    }

    // return null to let readline know all matches have been returned
    return null;
}
```
    1. Import c libs
    2. Tell readline what function should be called when a user attempts completion
    3. Use readline to get user input
    4. Add input to history
    5. Tell readline how to produce matches
    6. readline will call this repeatedly until no more matches are produced


# Phase 4: Clean up
Once I had finished all the sections on codecrafters I ran up Claude Code in the project and asked for feedback. The main thing it pointed out was that I was using `std.heap.page_allocator`. That's good for production, but it doesn't give me any feedback about memory leaks while developing. I should have been using `std.heap.GeneralPurposeAllocator`. The second point it made was that in one of my refactors I had swapped the `exit` builtin to use `std.process.exit(0)` instead of just exiting the REPL loop and letting the program finish normally. This kills the process immediately and doesn't let the allocator gather information about memory leaks.
I fixed these issues and ran my shell again. When exiting I was bombarded with memory leaks. Luckily it looked worse than it was, and after going through them one by one, I was able to fix them all within an hour or two. It would definitely have been better to use GPA from the start and weeding the leaks out as they appeared.

# Final thoughts
I have really enjoyed this project. I feel like zig comes very natural. It is very straight forward, and I don't think there has been any big gotchas, apart from my inability to free memory. I look forward to continuing with more of the Codecrafters challenges next year. Should anyone be interested, the complete code can be found on [github](https://github.com/Feryla/codecrafters-shell-zig).

[^1]: Don't quote me on this. I have noticed they rotate which challenge is free, but I don't actually know if they rotate through all of them or just between a few.
[^2]: I started out using zig version 0.14, but upgraded to 0.15.2 once I realized I was behind.
[^3]: I mean, I am still getting used to it, but it's getting better quickly.